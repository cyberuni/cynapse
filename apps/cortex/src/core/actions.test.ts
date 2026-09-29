import { describe, expect, it } from 'vitest'
import { ActionError, answer, ruleOnDecision, rulings } from './actions.ts'
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

	it('gives a ratify without a note a default body', () => {
		const entry = ruleOnDecision(createFixtureStore(), { ref: 'truss-auth#5', ruling: 'ratify', body: ' ' })
		expect(entry.body).toBe('Ratified.')
	})

	it('refuses an override without the Council outcome', () => {
		expect(() => ruleOnDecision(createFixtureStore(), { ref: 'truss-auth#5', ruling: 'override', body: '' })).toThrow(
			/needs the Council outcome/,
		)
	})

	it('rules on a decision only once', () => {
		const store = createFixtureStore()
		ruleOnDecision(store, { ref: 'truss-auth#5', ruling: 'ratify' })
		const second = () => ruleOnDecision(store, { ref: 'truss-auth#5', ruling: 'override', body: 'No.' })
		expect(second).toThrow(/already ratified/)
		try {
			second()
		} catch (err) {
			expect(err).toBeInstanceOf(ActionError)
			expect((err as ActionError).code).toBe('already_ruled')
		}
		expect(store.search({ types: ['truss.ratify', 'truss.override'] })).toHaveLength(1)
	})

	it('rules in the namespace of the decision', () => {
		const entry = ruleOnDecision(createFixtureStore(), { ref: 'm-login#3', ruling: 'ratify' })
		expect(entry.type).toBe('sdd.ratify')
	})

	it('refuses to rule on something that is not a decision', () => {
		expect(() => ruleOnDecision(createFixtureStore(), { ref: 'truss-auth#1', ruling: 'ratify' })).toThrow(
			/not a decision/,
		)
	})
})

describe('rulings', () => {
	it('maps each ruled decision in a stream to its ruling', () => {
		const store = createFixtureStore()
		const ruling = ruleOnDecision(store, { ref: 'truss-auth#5', ruling: 'override', body: 'Exempt legacy.' })
		expect(rulings(store, 'truss-auth')).toEqual({
			5: { seq: ruling.seq, type: 'truss.override', author: 'council', body: 'Exempt legacy.' },
		})
		expect(rulings(store, 'm-login')).toEqual({})
	})
})
