import { describe, expect, it } from 'vitest'
import { createFixtureStore } from './fixture.ts'
import { createMemoryStore } from './memory-store.ts'
import { triage } from './triage.ts'

describe('triage', () => {
	it('lists what awaits the Council with the entry that asked', () => {
		const result = triage(createFixtureStore(), 'council')
		expect(result.needsInput.map((n) => `${n.handle}#${n.seq}`)).toEqual(['m-token-refresh#2', 'arb-auth-expiry#4'])
		expect(result.needsInput[1]).toMatchObject({ type: 'truss.escalation', author: 'spec-writer' })
	})

	it('lists pending arbitrations with whose answer is missing', () => {
		const result = triage(createFixtureStore(), 'council')
		expect(result.arbitrations).toEqual([
			expect.objectContaining({ handle: 'arb-auth-expiry', waiting: ['test-writer'], anchor: 'truss-auth#6' }),
		])
	})

	it('counts unread per stream, most unread first', () => {
		const result = triage(createFixtureStore(), 'council')
		const counts = result.unread.map((u) => u.count)
		expect(counts).toEqual([...counts].sort((a, b) => b - a))
		expect(result.unread.find((u) => u.handle === 'm-login')?.count).toBe(4)
	})

	it('is empty for a quiet store', () => {
		expect(triage(createMemoryStore(), 'council')).toEqual({ needsInput: [], arbitrations: [], unread: [] })
	})
})
