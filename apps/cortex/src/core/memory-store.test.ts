import { describe, expect, it } from 'vitest'
import { createMemoryStore } from './memory-store.ts'

function storeWithMission() {
	const store = createMemoryStore()
	store.createStream({
		handle: 'm-auth',
		type: 'sdd.mission',
		title: 'Auth',
		members: [
			{ participant: 'council', role: 'owner' },
			{ participant: 'builder', role: 'agent' },
		],
	})
	return store
}

describe('memory store', () => {
	it('assigns seq in arrival order and resolves handle#seq', () => {
		const store = storeWithMission()
		store.append('m-auth', { author: 'builder', type: 'sdd.note', body: 'one' })
		const second = store.append('m-auth', { author: 'builder', type: 'sdd.note', body: 'two' })
		expect(second.seq).toBe(2)
		expect(store.entry('m-auth#2')?.body).toBe('two')
		expect(store.getStream('m-auth')?.stats.lastSeq).toBe(2)
	})

	it('links a reply to its parent and thread root', () => {
		const store = storeWithMission()
		const root = store.append('m-auth', { author: 'builder', type: 'sdd.note', body: 'q' })
		const reply = store.append('m-auth', { author: 'council', type: 'sdd.note', body: 'a', parent: 'm-auth#1' })
		const nested = store.append('m-auth', { author: 'builder', type: 'sdd.note', body: 'b', parent: reply.id })
		expect(nested.parentSeq).toBe(2)
		expect(nested.rootSeq).toBe(1)
		expect(nested.root).toBe(root.id)
	})

	it('counts unread for members, not their own entries', () => {
		const store = storeWithMission()
		store.append('m-auth', { author: 'builder', type: 'sdd.note', body: 'x' })
		store.append('m-auth', { author: 'council', type: 'sdd.note', body: 'y' })
		store.append('m-auth', { author: 'builder', type: 'sdd.note', body: 'z' })
		expect(store.unread('council')).toEqual([expect.objectContaining({ handle: 'm-auth', count: 2 })])
		store.markRead('m-auth', 'council')
		expect(store.unread('council')).toEqual([])
	})

	it('filters entries through a named view', () => {
		const store = storeWithMission()
		store.defineView('m-auth', { name: 'distilled', filter: { types: ['sdd.decision'] } })
		store.append('m-auth', { author: 'builder', type: 'sdd.note', body: 'x' })
		store.append('m-auth', { author: 'builder', type: 'sdd.decision', body: 'y' })
		expect(store.entries('m-auth', { view: 'distilled' }).map((e) => e.body)).toEqual(['y'])
	})

	it('logs a state change as an entry', () => {
		const store = storeWithMission()
		store.setState('m-auth', { key: 'q1', kind: 'needs-input', status: 'open', subject: 'council' }, 'builder')
		expect(store.states({ status: 'open', subject: 'council' })).toHaveLength(1)
		expect(store.entries('m-auth').at(-1)?.type).toBe('cynapse.state.changed')
	})

	it('searches across streams by tag', () => {
		const store = storeWithMission()
		store.createStream({ handle: 'm-db', type: 'sdd.mission', title: 'DB' })
		store.append('m-auth', { author: 'a', type: 'sdd.note', body: 'x', tags: ['topic:auth'] })
		store.append('m-db', { author: 'a', type: 'sdd.note', body: 'y', tags: ['topic:auth'] })
		store.append('m-db', { author: 'a', type: 'sdd.note', body: 'z' })
		expect(store.search({ tags: ['topic:auth'] }).map((e) => e.body)).toEqual(['x', 'y'])
	})
})
