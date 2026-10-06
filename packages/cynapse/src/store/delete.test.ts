import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CynapseError } from '../cli-error.js'
import { openStore } from './open.js'
import type { Channel, Participant, Store } from './types.js'

let store: Store
let legion: Participant
let reviewer: Participant
let inbox: Channel

beforeEach(() => {
	store = openStore({ path: ':memory:' })
	legion = store.registerParticipant({
		key: 'cyberlegion:unit/legion',
		kind: 'service',
		name: 'cyberlegion',
	}).participant
	const registered = store.registerParticipant({
		key: 'cyberlegion:role/reviewer',
		kind: 'agent',
		name: 'reviewer',
		registeredBy: legion.id,
	})
	reviewer = registered.participant
	inbox = registered.channel
})

afterEach(() => {
	store.close()
})

function captureError(fn: () => unknown): CynapseError {
	try {
		fn()
	} catch (error) {
		if (error instanceof CynapseError) return error
		throw error
	}
	throw new Error('expected a CynapseError')
}

function send(body: string, extra: { parent?: string; tags?: string[] } = {}) {
	return store.append(inbox.id, {
		author: 'alice',
		type: 'cyberlegion.mail',
		body,
		data: { secret: body },
		refs: ['gh:cyberuni/cynapse#60'],
		...extra,
	})
}

describe('deleteEntry', () => {
	it('erases the content and leaves a tombstone that keeps its place', () => {
		const message = send('the password is hunter2', { tags: ['cyberlegion.urgent'] })

		store.deleteEntry(message.id, reviewer.id)

		const tombstone = store.entry(message.id)
		expect(tombstone).toMatchObject({
			id: message.id,
			seq: message.seq,
			author: 'alice',
			type: 'cyberlegion.mail',
			body: '',
			tags: [],
			refs: [],
			deleted: { by: reviewer.id },
		})
		expect(tombstone?.data).toBeUndefined()
		expect(tombstone?.deleted?.at).toEqual(expect.any(String))
	})

	it('logs cynapse.entry.deleted in the channel, without the content', () => {
		const message = send('the password is hunter2')

		const logged = store.deleteEntry(message.id, reviewer.id)

		expect(logged).toMatchObject({
			author: reviewer.id,
			type: 'cynapse.entry.deleted',
			refs: [`${inbox.handle}#${message.seq}`],
			data: { target: message.id, seq: message.seq },
		})
		expect(JSON.stringify(logged)).not.toContain('hunter2')
	})

	it('never reuses the seq of a deleted last entry', () => {
		const message = send('last')
		store.deleteEntry(message.id, reviewer.id)

		const next = send('after')

		expect(next.seq).toBeGreaterThan(message.seq)
		expect(store.getChannel(inbox.id)?.stats.lastSeq).toBe(next.seq)
	})

	it('keeps replies resolving their parent and root', () => {
		const question = send('question')
		const reply = store.append(inbox.id, { author: reviewer.id, type: 'cyberlegion.mail', parent: question.id })

		store.deleteEntry(question.id, reviewer.id)

		expect(store.entry(reply.id)).toMatchObject({
			parent: question.id,
			parentSeq: question.seq,
			root: question.id,
			rootSeq: question.seq,
		})
	})

	it('hides tombstones from entries unless includeDeleted is set', () => {
		const kept = send('kept')
		const gone = send('gone')
		store.deleteEntry(gone.id, reviewer.id)

		const mail = { types: ['cyberlegion.mail'] }
		expect(store.entries(inbox.id, mail).map((e) => e.id)).toEqual([kept.id])
		expect(store.entries(inbox.id, { ...mail, includeDeleted: true }).map((e) => e.id)).toEqual([kept.id, gone.id])
	})

	it('hides tombstones from search, unread counts and channel stats', () => {
		store.addMember(inbox.id, reviewer.id, 'owner', legion.id)
		store.markRead(inbox.id, reviewer.id)
		const before = store.getChannel(inbox.id)?.stats.entries ?? 0
		const gone = send('gone')
		store.markRead(inbox.id, 'alice')

		store.deleteEntry(gone.id, reviewer.id)

		expect(store.search({ types: ['cyberlegion.mail'] })).toEqual([])
		// The delete's own log entry is the reviewer's, so nothing is unread for them.
		expect(store.unread(reviewer.id)).toEqual([])
		expect(store.getChannel(inbox.id, { as: reviewer.id })?.stats).toMatchObject({ entries: before + 1, unread: 0 })
	})

	it('does not let a deleted entry satisfy appendUnless', () => {
		const ruling = send('ruling')
		store.deleteEntry(ruling.id, reviewer.id)

		const again = store.appendUnless(
			inbox.id,
			{ author: 'alice', type: 'cyberlegion.mail', body: 'ruling again' },
			{ types: ['cyberlegion.mail'] },
		)

		expect(again.appended).toBe(true)
	})

	it('returns the first log entry when the entry is deleted again', () => {
		const message = send('twice')
		const first = store.deleteEntry(message.id, reviewer.id)

		const second = store.deleteEntry(message.id, reviewer.id)

		expect(second.id).toBe(first.id)
		expect(store.entries(inbox.id, { types: ['cynapse.entry.deleted'] })).toHaveLength(1)
	})

	it('accepts the handle#seq short form', () => {
		const message = send('short')

		store.deleteEntry(`${inbox.handle}#${message.seq}`, reviewer.id)

		expect(store.entry(message.id)?.deleted).toBeDefined()
	})

	it('lets anyone delete on any channel, since no caller can be verified, and logs who did', () => {
		const message = send('mail')
		store.createChannel({ handle: 'auth', type: 'sdd.mission', title: 'Auth', author: 'alice' })
		const note = store.append('auth', { author: 'alice', type: 'note', body: 'x' })

		expect(store.deleteEntry(message.id, 'alice').author).toBe('alice')
		expect(store.deleteEntry(note.id, 'bob').author).toBe('bob')
		expect(store.entry(note.id)?.deleted).toMatchObject({ by: 'bob' })
	})

	it('refuses to delete a cynapse.* entry, the record of the channel itself', () => {
		const [registered] = store.entries(inbox.id, { types: ['cynapse.participant.registered'] })

		expect(() => store.deleteEntry(registered?.id ?? '', reviewer.id)).toThrow(/cynapse\.\*/)
	})

	it('fails with not_found for an unknown entry', () => {
		expect(captureError(() => store.deleteEntry(`${inbox.handle}#999`, reviewer.id))).toMatchObject({
			code: 'not_found',
		})
	})

	it('refuses to reply to, tag or pin a tombstone', () => {
		const message = send('gone')
		store.deleteEntry(message.id, reviewer.id)

		expect(() => store.append(inbox.id, { author: 'alice', type: 'cyberlegion.mail', parent: message.id })).toThrow(
			/deleted/,
		)
		expect(() => store.addTags(message.id, ['cyberlegion.urgent'], reviewer.id)).toThrow(/deleted/)
		expect(() => store.pin(message.id, reviewer.id)).toThrow(/deleted/)
	})

	it('unpins a pinned entry it deletes', () => {
		const message = send('pinned')
		store.pin(message.id, reviewer.id)

		store.deleteEntry(message.id, reviewer.id)

		expect(store.getChannel(inbox.id)?.pinned).toEqual([])
	})

	it('moves the change token, so a polling runtime sees the delete', () => {
		const message = send('watched')
		const { token } = store.changes()

		store.deleteEntry(message.id, reviewer.id)

		expect(store.changes(token).channels.map((c) => c.channelId)).toEqual([inbox.id])
	})
})

describe('deleteChannel', () => {
	function workChannel() {
		const channel = store.createChannel({ handle: 'auth', type: 'sdd.mission', title: 'Auth', author: 'alice' })
		const one = store.append('auth', { author: 'alice', type: 'note', body: 'one' })
		const two = store.append('auth', { author: 'bob', type: 'note', body: 'two', parent: one.id })
		return { channel, one, two }
	}

	it('erases every entry outside cynapse.* and logs cynapse.channel.deleted with the count', () => {
		const { channel, one, two } = workChannel()

		const logged = store.deleteChannel('auth', 'carol')

		expect(logged).toMatchObject({
			channelId: channel.id,
			author: 'carol',
			type: 'cynapse.channel.deleted',
			data: { count: 2 },
		})
		expect(store.entry(one.id)).toMatchObject({ body: '', deleted: { by: 'carol' } })
		expect(store.entry(two.id)).toMatchObject({ parent: one.id, deleted: { by: 'carol' } })
		expect(store.entries('auth', { types: ['note'] })).toEqual([])
		expect(store.entries('auth').map((e) => e.type)).toContain('cynapse.channel.created')
	})

	it('moves the channel to the deleted lifecycle and hides it from listings', () => {
		workChannel()

		store.deleteChannel('auth', 'carol')

		expect(store.getChannel('auth')?.state).toBe('deleted')
		expect(store.listChannels().map((c) => c.handle)).not.toContain('auth')
		expect(store.listChannels({ includeDeleted: true }).map((c) => c.handle)).toContain('auth')
		expect(store.listChannels({ state: 'deleted' }).map((c) => c.handle)).toEqual(['auth'])
		expect(store.tree().map((t) => t.channel.handle)).not.toContain('auth')
	})

	it('keeps the channel resolvable, so a subject recreated returns it, and setLifecycle restores it', () => {
		const subject = { store: 'gh', nativeId: 'I_kwDOabc' }
		const channel = store.createChannel({ handle: 'gh:x/y/1', type: 'gh.issue', title: 'x', author: 'alice', subject })
		store.deleteChannel(channel.id, 'carol')

		expect(store.createChannel({ handle: 'gh:x/y/1', type: 'gh.issue', title: 'x', author: 'alice', subject }).id).toBe(
			channel.id,
		)
		store.setLifecycle(channel.id, 'active', 'carol')
		expect(store.listChannels().map((c) => c.id)).toContain(channel.id)
	})

	it('reserves the deleted lifecycle for deleteChannel', () => {
		workChannel()

		expect(() => store.setLifecycle('auth', 'deleted', 'carol')).toThrow(/deleteChannel/)
	})

	it("deletes an address channel too, such as a participant's inbox", () => {
		send('mail')

		expect(store.deleteChannel(inbox.id, 'alice').data).toMatchObject({ count: 1 })
	})

	it('leaves child channels and their entries alone', () => {
		const { one } = workChannel()
		const child = store.createChannel({
			handle: 'auth-review',
			type: 'sdd.review',
			title: 'r',
			author: 'alice',
			anchor: one.id,
		})
		const kept = store.append(child.id, { author: 'alice', type: 'note', body: 'still here' })

		store.deleteChannel('auth', 'carol')

		expect(store.entry(kept.id)?.body).toBe('still here')
		expect(store.getChannel(child.id)?.parent).toMatchObject({ entryId: one.id, seq: one.seq })
	})

	it('returns the last delete again when there is nothing new to erase', () => {
		workChannel()
		const first = store.deleteChannel('auth', 'carol')

		expect(store.deleteChannel('auth', 'carol').id).toBe(first.id)
	})

	it('erases what arrived since, when deleted again', () => {
		workChannel()
		store.deleteChannel('auth', 'carol')
		const late = store.append('auth', { author: 'alice', type: 'note', body: 'late' })

		expect(store.deleteChannel('auth', 'carol').data).toMatchObject({ count: 1 })
		expect(store.entry(late.id)?.deleted).toBeDefined()
	})

	it('fails with not_found for an unknown channel', () => {
		expect(captureError(() => store.deleteChannel('nope', 'carol'))).toMatchObject({ code: 'not_found' })
	})
})
