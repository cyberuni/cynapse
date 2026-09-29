import { describe, expect, it } from 'vitest'
import { answer, ruleOnDecision } from './actions.ts'
import { createFixtureStore } from './fixture.ts'
import { triage } from './triage.ts'

describe('answer', () => {
	it('replies to the asking entry and resolves the record', () => {
		const store = createFixtureStore()
		const entry = answer(store, { stream: 'arb-auth-expiry', key: 'escalation', body: '15 minutes.' })
		expect(entry).toMatchObject({ type: 'council.answer', author: 'council', parentSeq: 5 })
		expect(triage(store, 'council').needsInput.map((n) => n.handle)).toEqual(['m-token-refresh'])
	})

	it('records a picked option as the choice', () => {
		const store = createFixtureStore()
		const entry = answer(store, {
			stream: 'arb-auth-expiry',
			key: 'escalation',
			body: '15 minutes',
			choice: '15 minutes',
		})
		expect(entry.data).toEqual({ choice: '15 minutes', question: 'Token expiry?' })
	})

	it('refuses a record that is not open for the Council', () => {
		const store = createFixtureStore()
		expect(() => answer(store, { stream: 'm-login', key: 'nope', body: 'x' })).toThrow(/no open needs-input/)
	})
})

describe('ruleOnDecision', () => {
	it('ratifies a decision as a reply in its stream', () => {
		const store = createFixtureStore()
		const entry = ruleOnDecision(store, { ref: 'truss-auth#5', ruling: 'ratify' })
		expect(entry).toMatchObject({ type: 'truss.ratify', stream: 'truss-auth', parentSeq: 5, author: 'council' })
	})

	it('overrides a decision with the Council outcome', () => {
		const store = createFixtureStore()
		const entry = ruleOnDecision(store, { ref: 'truss-auth#5', ruling: 'override', body: 'Exempt legacy clients.' })
		expect(entry).toMatchObject({ type: 'truss.override', body: 'Exempt legacy clients.' })
	})

	it('refuses to rule on something that is not a decision', () => {
		expect(() => ruleOnDecision(createFixtureStore(), { ref: 'truss-auth#1', ruling: 'ratify' })).toThrow(
			/not a decision/,
		)
	})
})
