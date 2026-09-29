import { describe, expect, it } from 'vitest'
import { createFixtureStore } from './fixture.ts'
import { members, waits } from './members.ts'

describe('members', () => {
	it('lists members with role, cursor, and unread', () => {
		const list = members(createFixtureStore(), 'm-login')
		expect(list.find((m) => m.participant === 'council')).toEqual({
			participant: 'council',
			role: 'owner',
			cursor: 3,
			unread: 4,
			kind: 'human',
		})
	})
})

describe('waits', () => {
	it('shows who waits on whom and why', () => {
		const list = waits(createFixtureStore())
		expect(list).toEqual(
			expect.arrayContaining([
				{ waiter: 'builder', on: 'council', stream: 'm-token-refresh', seq: 2, kind: 'needs-input' },
				{ waiter: 'spec-writer', on: 'council', stream: 'arb-auth-expiry', seq: 5, kind: 'needs-input' },
				{ waiter: 'arb-auth-expiry', on: 'test-writer', stream: 'arb-auth-expiry', kind: 'pending-answers' },
			]),
		)
		expect(list).toHaveLength(3)
	})

	it('narrows to one stream', () => {
		expect(waits(createFixtureStore(), 'm-token-refresh')).toHaveLength(1)
	})
})
