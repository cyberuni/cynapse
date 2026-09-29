import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CynapseError } from '../cli-error.js'
import { uuidv5, uuidv7 } from '../ids.js'
import { openStore } from './open.js'
import type { Store } from './types.js'

let store: Store

beforeEach(() => {
	store = openStore({ path: ':memory:' })
})

afterEach(() => {
	store.close()
})

function mission(handle = 'auth') {
	return store.createStream({ handle, type: 'sdd.mission', title: 'Add auth', author: 'alice' })
}

describe('streams', () => {
	it('creates a stream with a UUIDv7 id and records its creation as the first entry', () => {
		const stream = mission()
		expect(stream.id[14]).toBe('7')
		expect(stream).toMatchObject({ handle: 'auth', type: 'sdd.mission', state: 'active', stats: { lastSeq: 1 } })
		expect(store.entries('auth')[0]).toMatchObject({ seq: 1, type: 'cynapse.stream.created', author: 'alice' })
	})

	it('derives a keyed stream id, so opening it twice gives one stream', () => {
		const a = store.createStream({ handle: 'dm-a-b', type: 'cynapse.dm', title: 'DM', author: 'a', key: 'dm:a,b' })
		const b = store.createStream({ handle: 'dm-a-b', type: 'cynapse.dm', title: 'DM', author: 'b', key: 'dm:a,b' })
		expect(a.id).toBe(uuidv5('dm:a,b'))
		expect(b.id).toBe(a.id)
		expect(store.listStreams()).toHaveLength(1)
	})

	it('branches a child stream from an anchor entry in the parent', () => {
		mission()
		const anchor = store.append('auth', { author: 'alice', type: 'truss.arbitration-needed', body: 'which token?' })
		const child = store.createStream({
			handle: 'auth-arb-1',
			type: 'truss.arbitration',
			title: 'Token format',
			author: 'alice',
			anchor: 'auth#2',
		})
		expect(child.id).toBe(uuidv5(anchor.id))
		expect(child.parent).toEqual({ streamId: anchor.streamId, entryId: anchor.id, seq: 2 })
		expect(store.children('auth').map((s) => s.handle)).toEqual(['auth-arb-1'])
		expect(store.tree()[0]?.children[0]?.stream.handle).toBe('auth-arb-1')
	})

	it('keeps the old handle as an alias after a rename', () => {
		const stream = mission()
		store.renameStream('auth', 'auth-v2', 'alice')
		expect(store.getStream('auth')?.id).toBe(stream.id)
		expect(store.getStream('auth-v2')).toMatchObject({ handle: 'auth-v2', aliases: ['auth'] })
		expect(store.entries('auth-v2').at(-1)?.type).toBe('cynapse.stream.renamed')
	})

	it('refuses a handle another stream holds', () => {
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
		expect(brief.stream).toMatchObject({
			members: [{ participant: 'bob', role: 'reviewer', cursor: 0 }],
			context: ['gh:cyberuni/cynapse#12'],
			pinned: [decision.seq],
			state: 'reconciled',
		})
		expect(brief.pinned.map((e) => e.body)).toEqual(['use JWT'])
		expect(brief.stream.stats.unread).toBeGreaterThan(0)
		expect(store.entries('auth', { types: ['cynapse.*'] }).map((e) => e.type)).toEqual([
			'cynapse.stream.created',
			'cynapse.member.joined',
			'cynapse.context.added',
			'cynapse.pinned',
			'cynapse.state.changed',
		])
	})
})

describe('entries', () => {
	it('assigns contiguous seqs in arrival order', () => {
		mission()
		const seqs = [1, 2, 3].map((n) => store.append('auth', { author: 'alice', type: 'note', body: `n${n}` }).seq)
		expect(seqs).toEqual([2, 3, 4])
	})

	it('treats re-appending the same id as a no-op', () => {
		mission()
		const id = uuidv7()
		const first = store.append('auth', { id, author: 'alice', type: 'note', body: 'once' })
		const again = store.append('auth', { id, author: 'alice', type: 'note', body: 'once' })
		expect(again).toEqual(first)
		expect(store.getStream('auth')?.stats.entries).toBe(2)
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
		expect(store.unread('bob')).toEqual([{ streamId: expect.any(String), handle: 'auth', count: 2 }])
	})

	it('filters through a saved view such as distilled', () => {
		mission()
		store.append('auth', { author: 'alice', type: 'note', body: 'chatter' })
		store.append('auth', { author: 'alice', type: 'sdd.decision', body: 'decided' })
		store.defineView('auth', 'distilled', { types: ['sdd.decision'] }, 'alice')
		expect(store.entries('auth', { view: 'distilled' }).map((e) => e.body)).toEqual(['decided'])
		expect(store.views('auth')).toEqual([
			{ streamId: expect.any(String), name: 'distilled', filter: { types: ['sdd.decision'] } },
		])
	})

	it('searches across streams by type prefix', () => {
		mission('a')
		mission('b')
		store.append('a', { author: 'x', type: 'sdd.gate', data: { verdict: 'approve' } })
		store.append('b', { author: 'x', type: 'sdd.gate', data: { verdict: 'reject' } })
		expect(store.search({ types: ['sdd.*'] }).map((e) => e.stream)).toEqual(['a', 'b'])
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
