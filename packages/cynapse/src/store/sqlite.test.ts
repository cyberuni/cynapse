import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CynapseError } from '../cli-error.js'
import { uuidv5, uuidv7 } from '../ids.js'
import { openStore } from './open.js'
import { HANDLED_TAG } from './sqlite.js'
import type { AppendInput, Store } from './types.js'

let store: Store

beforeEach(() => {
	store = openStore({ path: ':memory:' })
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

function mission(handle = 'auth') {
	return store.createChannel({ handle, type: 'sdd.mission', title: 'Add auth', author: 'alice' })
}

describe('channels', () => {
	it('creates a channel with a UUIDv7 id and records its creation as the first entry', () => {
		const channel = mission()
		expect(channel.id[14]).toBe('7')
		expect(channel).toMatchObject({ handle: 'auth', type: 'sdd.mission', state: 'active', stats: { lastSeq: 1 } })
		expect(store.entries('auth')[0]).toMatchObject({ seq: 1, type: 'cynapse.channel.created', author: 'alice' })
	})

	it('derives a keyed channel id, so opening it twice gives one channel', () => {
		const a = store.createChannel({ handle: 'dm-a-b', type: 'cynapse.dm', title: 'DM', author: 'a', key: 'dm:a,b' })
		const b = store.createChannel({ handle: 'dm-a-b', type: 'cynapse.dm', title: 'DM', author: 'b', key: 'dm:a,b' })
		expect(a.id).toBe(uuidv5('dm:a,b'))
		expect(b.id).toBe(a.id)
		expect(store.listChannels()).toHaveLength(1)
	})

	it('branches a child channel from an anchor entry in the parent', () => {
		mission()
		const anchor = store.append('auth', { author: 'alice', type: 'truss.arbitration-needed', body: 'which token?' })
		const child = store.createChannel({
			handle: 'auth-arb-1',
			type: 'truss.arbitration',
			title: 'Token format',
			author: 'alice',
			anchor: 'auth#2',
		})
		expect(child.id).toBe(uuidv5(anchor.id))
		expect(child.parent).toEqual({ channelId: anchor.channelId, entryId: anchor.id, seq: 2 })
		expect(store.children('auth').map((s) => s.handle)).toEqual(['auth-arb-1'])
		expect(store.tree()[0]?.children[0]?.channel.handle).toBe('auth-arb-1')
	})

	it('keeps the old handle as an alias after a rename', () => {
		const channel = mission()
		store.renameChannel('auth', 'auth-v2', 'alice')
		expect(store.getChannel('auth')?.id).toBe(channel.id)
		expect(store.getChannel('auth-v2')).toMatchObject({ handle: 'auth-v2', aliases: ['auth'] })
		expect(store.entries('auth-v2').at(-1)?.type).toBe('cynapse.channel.renamed')
	})

	it('refuses a derived id reused with a different channel, naming the field', () => {
		const dm = { handle: 'dm-a-b', type: 'cynapse.dm', title: 'DM', author: 'a', key: 'dm:a,b' }
		store.createChannel(dm)
		store.renameChannel('dm-a-b', 'dm-ab', 'a')
		expect(store.createChannel({ ...dm, author: 'b' }).handle).toBe('dm-ab')
		const error = captureError(() => store.createChannel({ ...dm, title: 'Other' }))
		expect(error).toMatchObject({ code: 'id_conflict' })
		expect(error.message).toContain('title')
		expect(captureError(() => store.createChannel({ ...dm, traits: { wake: true } })).message).toContain('traits')
		expect(captureError(() => store.createChannel({ ...dm, handle: 'dm-x' })).message).toContain('handle')
	})

	it('refuses a handle another channel holds', () => {
		mission()
		expect(() => mission()).toThrow(CynapseError)
	})

	it('writes each metadata change as an entry and reflects it in the briefing', () => {
		mission()
		store.addMember('auth', 'bob', 'reviewer', 'alice')
		store.addContext('auth', 'gh:cyberuni/cynapse#12', 'alice')
		const decision = store.append('auth', { author: 'bob', type: 'sdd.decision', body: 'use JWT' })
		store.pin(decision.id, 'bob')
		store.setLifecycle('auth', 'reconciled', 'alice')
		const brief = store.brief('auth', { as: 'bob' })
		expect(brief.channel).toMatchObject({
			members: [{ participant: 'bob', role: 'reviewer', cursor: 0 }],
			context: ['gh:cyberuni/cynapse#12'],
			pinned: [decision.seq],
			state: 'reconciled',
		})
		expect(brief.pinned.map((e) => e.body)).toEqual(['use JWT'])
		expect(brief.channel.stats.unread).toBeGreaterThan(0)
		expect(store.entries('auth', { types: ['cynapse.*'] }).map((e) => e.type)).toEqual([
			'cynapse.channel.created',
			'cynapse.member.joined',
			'cynapse.context.added',
			'cynapse.pinned',
			'cynapse.state.changed',
		])
	})
})

describe('entries', () => {
	it('matches a type prefix literally and case-sensitively', () => {
		mission()
		for (const type of ['x.n', 'demo.msg', 'de_o.msg', 'de%o.msg'])
			store.append('auth', { author: 'alice', type, body: type })
		const types = (type: string) => store.entries('auth', { types: [type] }).map((e) => e.type)
		expect(types('X.*')).toEqual([])
		expect(types('x.*')).toEqual(['x.n'])
		expect(types('de_o.*')).toEqual(['de_o.msg'])
		expect(types('de%o.*')).toEqual(['de%o.msg'])
		expect(
			store.entries('auth', { types: ['de_o.*', 'de%o.*', 'demo.*'], excludeTypes: ['de_o.*'] }).map((e) => e.type),
		).toEqual(['demo.msg', 'de%o.msg'])
	})

	it('assigns contiguous seqs in arrival order', () => {
		mission()
		const seqs = [1, 2, 3].map((n) => store.append('auth', { author: 'alice', type: 'note', body: `n${n}` }).seq)
		expect(seqs).toEqual([2, 3, 4])
	})

	it('refuses the same id with a different payload, naming the first differing field', () => {
		mission()
		mission('other')
		const id = uuidv7()
		const write = { id, author: 'alice', type: 'note', body: 'once', tags: ['a.x', 'a.y'], data: { n: 1, m: 2 } }
		store.append('auth', write)
		// A retry with the same payload, keys and tags in another order, is the same write.
		expect(store.append('auth', { ...write, tags: ['a.y', 'a.x'], data: { m: 2, n: 1 } }).seq).toBe(2)
		// Labels added later do not make the retry look different.
		store.addTags(id, ['a.z'], 'bob')
		expect(store.append('auth', write).seq).toBe(2)
		for (const [field, change] of [
			['channel', {}],
			['type', { type: 'other' }],
			['body', { body: 'twice' }],
			['data', { data: { n: 2 } }],
			['tags', { tags: ['a.x'] }],
			['refs', { refs: ['gh:o/r#1'] }],
			['parent', { parent: 'auth#1' }],
			['author', { author: 'bob' }],
		] as [string, Partial<AppendInput>][]) {
			const error = captureError(() => store.append(field === 'channel' ? 'other' : 'auth', { ...write, ...change }))
			expect(error, field).toMatchObject({ code: 'id_conflict' })
			expect(error.message, field).toContain(id)
			expect(error.message, field).toContain(`differs in ${field}`)
		}
	})

	it('treats re-appending the same id as a no-op', () => {
		mission()
		const id = uuidv7()
		const first = store.append('auth', { id, author: 'alice', type: 'note', body: 'once' })
		const again = store.append('auth', { id, author: 'alice', type: 'note', body: 'once' })
		expect(again).toEqual(first)
		expect(store.getChannel('auth')?.stats.entries).toBe(2)
	})

	it('resolves the short reference handle#seq anywhere an entry is expected', () => {
		mission()
		const note = store.append('auth', { author: 'alice', type: 'note', body: 'hi' })
		expect(store.entry('auth#2')?.id).toBe(note.id)
		expect(store.entry('auth', 2)?.id).toBe(note.id)
		expect(store.entry('auth#99')).toBeUndefined()
	})

	it('sets root at write time so a thread is one query', () => {
		mission()
		const q = store.append('auth', { author: 'alice', type: 'note', body: 'q' })
		const a = store.append('auth', { author: 'bob', type: 'note', body: 'a', parent: 'auth#2' })
		const b = store.append('auth', { author: 'alice', type: 'note', body: 'b', parent: a.id })
		expect(b).toMatchObject({ parent: a.id, parentSeq: a.seq, root: q.id, rootSeq: q.seq })
		expect(store.entries('auth', { root: q.id }).map((e) => e.body)).toEqual(['q', 'a', 'b'])
	})

	it('computes the current tags from label entries', () => {
		mission()
		store.append('auth', { author: 'alice', type: 'note', body: 'x', tags: ['sdd.risk'] })
		store.addTags('auth#2', ['sdd.blocker'], 'bob')
		store.removeTags('auth#2', ['sdd.risk'], 'bob')
		expect(store.entry('auth#2')?.tags).toEqual(['sdd.blocker'])
		expect(store.entries('auth', { tags: ['sdd.blocker'] }).map((e) => e.seq)).toEqual([2])
		expect(store.entries('auth', { types: ['cynapse.label'] })).toHaveLength(2)
	})

	it('reads unread-only, metadata-only, and from the latest summary', () => {
		mission()
		store.addMember('auth', 'bob', 'reviewer', 'alice')
		store.append('auth', { author: 'alice', type: 'note', body: 'old' })
		store.markRead('auth', 'bob')
		store.append('auth', { author: 'alice', type: 'cynapse.summary', body: 'so far' })
		store.append('auth', { author: 'bob', type: 'note', body: 'mine' })
		store.append('auth', { author: 'alice', type: 'note', body: 'new', data: { x: 1 } })
		expect(store.entries('auth', { unreadFor: 'bob' }).map((e) => e.body)).toEqual(['so far', 'new'])
		expect(store.entries('auth', { fromSummary: true }).map((e) => e.body)).toEqual(['so far', 'mine', 'new'])
		const meta = store.entries('auth', { metaOnly: true }).at(-1)
		expect(meta).toMatchObject({ type: 'note', body: '' })
		expect(meta?.data).toBeUndefined()
		expect(store.unread('bob')).toEqual([{ channelId: expect.any(String), handle: 'auth', count: 2 }])
	})

	it('excludes entries by current tag and by author', () => {
		mission()
		store.append('auth', { author: 'alice', type: 'note', body: 'handled', tags: ['sdd.risk'] })
		store.append('auth', { author: 'bob', type: 'note', body: 'open' })
		store.append('auth', { author: 'carol', type: 'note', body: 'later handled' })
		store.addTags('auth#4', ['x.done'], 'alice')
		store.append('auth', { author: 'carol', type: 'note', body: 'reopened', tags: ['x.done'] })
		store.removeTags('auth#6', ['x.done'], 'alice')
		const notes = { types: ['note'] }
		expect(store.entries('auth', { ...notes, excludeTags: ['x.done', 'sdd.risk'] }).map((e) => e.body)).toEqual([
			'open',
			'reopened',
		])
		expect(store.entries('auth', { ...notes, excludeAuthors: ['alice', 'carol'] }).map((e) => e.body)).toEqual(['open'])
		expect(store.search({ ...notes, excludeAuthors: ['bob'], excludeTags: ['sdd.risk'] }).map((e) => e.body)).toEqual([
			'later handled',
			'reopened',
		])
	})

	it("combines a view's exclusions with the query's", () => {
		mission()
		store.append('auth', { author: 'alice', type: 'note', body: 'a', tags: ['x.done'] })
		store.append('auth', { author: 'bob', type: 'note', body: 'b' })
		store.append('auth', { author: 'carol', type: 'note', body: 'c' })
		store.defineView('auth', 'open', { types: ['note'], excludeTags: ['x.done'] }, 'alice')
		expect(store.entries('auth', { view: 'open' }).map((e) => e.body)).toEqual(['b', 'c'])
		expect(store.entries('auth', { view: 'open', excludeAuthors: ['bob'] }).map((e) => e.body)).toEqual(['c'])
	})

	describe('followed threads', () => {
		function inbox() {
			store.createChannel({ handle: 'bob-inbox', type: 'cynapse.address', title: 'Bob', author: 'bob' })
			store.addMember('bob-inbox', 'bob', 'owner', 'bob')
		}

		it('counts a reply to the asker on a channel they are not a member of, until they read it', () => {
			inbox()
			const question = store.append('bob-inbox', { author: 'alice', type: 'note', body: 'q?' })
			store.append('bob-inbox', { author: 'carol', type: 'note', body: 'unrelated' })
			expect(store.unread('alice')).toEqual([])
			store.append('bob-inbox', { author: 'bob', type: 'note', body: 'a', parent: question.id })
			expect(store.unread('alice')).toEqual([{ channelId: expect.any(String), handle: 'bob-inbox', count: 1 }])
			store.markRead('bob-inbox', 'alice')
			expect(store.unread('alice')).toEqual([])
		})

		it("counts only replies after the later of the cursor and the follower's own last entry in the thread", () => {
			inbox()
			const question = store.append('bob-inbox', { author: 'alice', type: 'note', body: 'q?' })
			store.append('bob-inbox', { author: 'bob', type: 'note', body: 'a1', parent: question.id })
			store.append('bob-inbox', { author: 'alice', type: 'note', body: 'follow-up', parent: question.id })
			store.append('bob-inbox', { author: 'bob', type: 'note', body: 'a2', parent: question.id })
			store.append('bob-inbox', { author: 'bob', type: 'note', body: 'a3', parent: question.id })
			expect(store.unread('alice')[0]?.count).toBe(2)
			store.markRead('bob-inbox', 'alice', store.entries('bob-inbox').find((e) => e.body === 'a2')?.seq)
			expect(store.unread('alice')[0]?.count).toBe(1)
		})

		it('follows a thread the participant replied in but did not start', () => {
			inbox()
			const root = store.append('bob-inbox', { author: 'carol', type: 'note', body: 'q' })
			store.append('bob-inbox', { author: 'alice', type: 'note', body: 'me too', parent: root.id })
			store.append('bob-inbox', { author: 'bob', type: 'note', body: 'a', parent: root.id })
			expect(store.unread('alice')).toEqual([{ channelId: expect.any(String), handle: 'bob-inbox', count: 1 }])
		})

		it('does not double-count a thread in a channel the participant is a member of', () => {
			mission()
			store.addMember('auth', 'alice', 'owner', 'alice')
			store.markRead('auth', 'alice')
			const question = store.append('auth', { author: 'alice', type: 'note', body: 'q?' })
			store.append('auth', { author: 'bob', type: 'note', body: 'a', parent: question.id })
			store.append('auth', { author: 'bob', type: 'note', body: 'other' })
			expect(store.unread('alice')).toEqual([{ channelId: expect.any(String), handle: 'auth', count: 2 }])
		})

		it('lists member and followed channels together, ordered by handle', () => {
			inbox()
			mission()
			store.addMember('auth', 'alice', 'owner', 'alice')
			store.append('auth', { author: 'bob', type: 'note', body: 'hi' })
			const question = store.append('bob-inbox', { author: 'alice', type: 'note', body: 'q?' })
			store.append('bob-inbox', { author: 'bob', type: 'note', body: 'a', parent: question.id })
			expect(store.unread('alice').map((u) => u.handle)).toEqual(['auth', 'bob-inbox'])
		})
	})

	it('filters through a saved view such as distilled', () => {
		mission()
		store.append('auth', { author: 'alice', type: 'note', body: 'chatter' })
		store.append('auth', { author: 'alice', type: 'sdd.decision', body: 'decided' })
		store.defineView('auth', 'distilled', { types: ['sdd.decision'] }, 'alice')
		expect(store.entries('auth', { view: 'distilled' }).map((e) => e.body)).toEqual(['decided'])
		expect(store.views('auth')).toEqual([
			{ channelId: expect.any(String), name: 'distilled', filter: { types: ['sdd.decision'] } },
		])
	})

	it('searches across channels by type prefix', () => {
		mission('a')
		mission('b')
		store.append('a', { author: 'x', type: 'sdd.gate', data: { verdict: 'approve' } })
		store.append('b', { author: 'x', type: 'sdd.gate', data: { verdict: 'reject' } })
		expect(store.search({ types: ['sdd.*'] }).map((e) => e.channel)).toEqual(['a', 'b'])
	})
})

describe('cynapse.handled', () => {
	function inbox() {
		store.registerAddress({ handle: 'bob-inbox', type: 'cynapse.address', title: 'Bob', author: 'bob', owner: 'bob' })
		store.addMember('bob-inbox', 'carol', 'member', 'bob')
		return store.append('bob-inbox', { author: 'alice', type: 'note', body: 'q?' })
	}

	function labels(ref: string) {
		return store.entries(ref, { types: ['cynapse.label'] })
	}

	it('lets the owner of an address channel add and remove it, each written as a label entry', () => {
		const message = inbox()
		store.addTags(message.id, [HANDLED_TAG], 'bob')
		expect(store.entries('bob-inbox', { excludeTags: [HANDLED_TAG], types: ['note'] })).toEqual([])
		store.removeTags(message.id, [HANDLED_TAG], 'bob')
		expect(store.entry(message.id)?.tags).toEqual([])
		expect(labels('bob-inbox').map((e) => e.data)).toEqual([
			{ target: message.id, add: [HANDLED_TAG] },
			{ target: message.id, remove: [HANDLED_TAG] },
		])
	})

	it.each([
		['a member who is not the owner', 'carol'],
		['an observer who is not a member', 'dave'],
	])('rejects %s, writing no label entry', (_, who) => {
		const message = inbox()
		expect(captureError(() => store.addTags(message.id, [HANDLED_TAG], who))).toMatchObject({
			code: 'not_owner',
			exitCode: 1,
		})
		store.addTags(message.id, [HANDLED_TAG], 'bob')
		expect(captureError(() => store.removeTags(message.id, [HANDLED_TAG], who))).toMatchObject({ code: 'not_owner' })
		expect(store.entry(message.id)?.tags).toEqual([HANDLED_TAG])
		expect(labels('bob-inbox')).toHaveLength(1)
	})

	it('rejects a sender appending an entry already marked handled', () => {
		inbox()
		expect(
			captureError(() => store.append('bob-inbox', { author: 'alice', type: 'note', tags: [HANDLED_TAG] })),
		).toMatchObject({ code: 'not_owner' })
		expect(store.append('bob-inbox', { author: 'bob', type: 'note', tags: [HANDLED_TAG] }).tags).toEqual([HANDLED_TAG])
	})

	it('rejects it on a work channel, which has no owner', () => {
		mission()
		store.addMember('auth', 'alice', 'owner', 'alice')
		const entry = store.append('auth', { author: 'alice', type: 'note' })
		const error = captureError(() => store.addTags(entry.id, [HANDLED_TAG], 'alice'))
		expect(error).toMatchObject({ code: 'not_address', exitCode: 1 })
		expect(error.message).toContain('address channels')
		expect(captureError(() => store.removeTags(entry.id, [HANDLED_TAG], 'alice'))).toMatchObject({
			code: 'not_address',
		})
		expect(
			captureError(() => store.append('auth', { author: 'alice', type: 'note', tags: [HANDLED_TAG] })),
		).toMatchObject({ code: 'not_address' })
		expect(labels('auth')).toEqual([])
	})

	it('leaves other tags open to anyone', () => {
		const message = inbox()
		store.addTags(message.id, ['sdd.risk'], 'dave')
		expect(store.entry(message.id)?.tags).toEqual(['sdd.risk'])
	})
})

describe('appendUnless', () => {
	function decision() {
		mission()
		return store.append('auth', { author: 'alice', type: 'sdd.decision', body: 'JWT' })
	}

	it('appends when no entry matches', () => {
		const d = decision()
		const result = store.appendUnless(
			'auth',
			{ author: 'council', type: 'sdd.ratify', parent: d.id },
			{ parent: d.id, types: ['sdd.ratify', 'sdd.override'] },
		)
		expect(result).toMatchObject({ appended: true, entry: { type: 'sdd.ratify', parentSeq: d.seq } })
		expect(store.getChannel('auth')?.stats.lastSeq).toBe(3)
	})

	it('writes nothing and returns the earliest match when one exists', () => {
		const d = decision()
		const unless = { parent: `auth#${d.seq}`, types: ['sdd.ratify', 'sdd.override'] }
		const first = store.appendUnless('auth', { author: 'council', type: 'sdd.ratify', parent: d.id }, unless)
		const second = store.appendUnless(
			'auth',
			{ author: 'council', type: 'sdd.override', parent: d.id, body: 'No.' },
			unless,
		)
		expect(second).toEqual({ appended: false, existing: first.appended && first.entry })
		expect(store.getChannel('auth')?.stats.lastSeq).toBe(3)
	})

	it('ignores entries that match the types but reply to another entry, or match the parent but not the types', () => {
		const d = decision()
		const other = store.append('auth', { author: 'alice', type: 'sdd.decision', body: 'Sessions' })
		store.append('auth', { author: 'council', type: 'sdd.ratify', parent: other.id })
		store.append('auth', { author: 'bob', type: 'note', parent: d.id, body: 'agreed' })
		const result = store.appendUnless(
			'auth',
			{ author: 'council', type: 'sdd.ratify', parent: d.id },
			{ parent: d.id, types: ['sdd.ratify', 'sdd.override'] },
		)
		expect(result.appended).toBe(true)
	})

	it('treats a retry of the write that landed as that write, not as a conflict', () => {
		const d = decision()
		const write = { id: uuidv7(), author: 'council', type: 'sdd.ratify', parent: d.id }
		const unless = { parent: d.id, types: ['sdd.ratify'] }
		const first = store.appendUnless('auth', write, unless)
		expect(store.appendUnless('auth', write, unless)).toEqual(first)
	})
})

describe('read state and state records', () => {
	it('moves a cursor forward only', () => {
		mission()
		store.append('auth', { author: 'alice', type: 'note' })
		expect(store.markRead('auth', 'bob').cursor).toBe(2)
		expect(store.markRead('auth', 'bob', 1).cursor).toBe(2)
	})

	it('keeps the current state record and logs every transition as an entry', () => {
		mission()
		store.setState('auth', { key: 'escalation', kind: 'needs-input', status: 'open', subject: 'council' }, 'bot')
		const resolved = store.setState(
			'auth',
			{ key: 'escalation', kind: 'needs-input', status: 'resolved', subject: 'council' },
			'council',
		)
		expect(resolved).toMatchObject({ status: 'resolved', seq: 3 })
		expect(store.states({ kind: 'needs-input', status: 'open' })).toEqual([])
		expect(store.entries('auth', { types: ['cynapse.state.changed'] }).map((e) => e.data)).toEqual([
			{ key: 'escalation', kind: 'needs-input', to: 'open', subject: 'council' },
			{ key: 'escalation', kind: 'needs-input', from: 'open', to: 'resolved', subject: 'council' },
		])
	})
})
