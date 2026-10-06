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

	it("lets only the address channel's owner delete", () => {
		const message = send('mine')

		expect(captureError(() => store.deleteEntry(message.id, 'alice'))).toMatchObject({ code: 'not_owner' })
		expect(store.entry(message.id)?.body).toBe('mine')
	})

	it('is not defined on a work channel', () => {
		store.createChannel({ handle: 'auth', type: 'sdd.mission', title: 'Auth', author: 'alice' })
		const note = store.append('auth', { author: 'alice', type: 'note', body: 'x' })

		expect(captureError(() => store.deleteEntry(note.id, 'alice'))).toMatchObject({ code: 'not_address' })
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

describe('purgeParticipant', () => {
	it("tombstones every entry in a retired participant's address channel outside cynapse.*", () => {
		const one = send('one')
		const two = send('two')
		store.retireParticipant(reviewer.id, legion.id)

		const logged = store.purgeParticipant(reviewer.id, legion.id)

		expect(logged).toMatchObject({
			author: legion.id,
			type: 'cynapse.participant.purged',
			data: { participant: reviewer.id, count: 2 },
		})
		expect(store.entry(one.id)?.deleted).toMatchObject({ by: legion.id })
		expect(store.entry(two.id)?.body).toBe('')
		const kept = store.entries(inbox.id).map((e) => e.type)
		expect(kept).toEqual(expect.arrayContaining(['cynapse.participant.registered', 'cynapse.participant.retired']))
		expect(kept).not.toContain('cyberlegion.mail')
	})

	it('needs the participant retired first', () => {
		send('live mail')

		expect(() => store.purgeParticipant(reviewer.id, legion.id)).toThrow(/retire/)
	})

	it('lets the participant itself or the unit that registered it purge, and no one else', () => {
		send('mail')
		store.retireParticipant(reviewer.id, legion.id)

		expect(captureError(() => store.purgeParticipant(reviewer.id, 'alice'))).toMatchObject({ code: 'not_owner' })
		expect(store.purgeParticipant(reviewer.id, reviewer.id).data).toMatchObject({ count: 1 })
	})

	it('does not touch what the participant wrote in other channels', () => {
		store.createChannel({ handle: 'auth', type: 'sdd.mission', title: 'Auth', author: 'alice' })
		const elsewhere = store.append('auth', { author: reviewer.id, type: 'note', body: 'still here' })
		store.retireParticipant(reviewer.id, legion.id)

		store.purgeParticipant(reviewer.id, legion.id)

		expect(store.entry(elsewhere.id)?.body).toBe('still here')
	})

	it('returns the last purge again when there is nothing new to purge', () => {
		send('mail')
		store.retireParticipant(reviewer.id, legion.id)
		const first = store.purgeParticipant(reviewer.id, legion.id)

		expect(store.purgeParticipant(reviewer.id, legion.id).id).toBe(first.id)
	})

	it('leaves a revived participant with an empty inbox and its history', () => {
		send('old mail')
		store.retireParticipant(reviewer.id, legion.id)
		store.purgeParticipant(reviewer.id, legion.id)

		const revived = store.registerParticipant({
			key: 'cyberlegion:role/reviewer',
			kind: 'agent',
			name: 'reviewer',
			registeredBy: legion.id,
		})

		expect(revived.channel.id).toBe(inbox.id)
		expect(store.entries(inbox.id, { excludeTypes: ['cynapse.*'] })).toEqual([])
	})
})
