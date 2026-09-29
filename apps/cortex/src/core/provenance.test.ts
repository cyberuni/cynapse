import { describe, expect, it } from 'vitest'
import { createFixtureStore } from './fixture.ts'
import { provenance } from './provenance.ts'

describe('provenance', () => {
	it('walks a decision to its anchor, arbitration transcript, and contributions', () => {
		const trail = provenance(createFixtureStore(), 'truss-auth#5')
		expect(trail?.decision.type).toBe('truss.decision')
		expect(trail?.anchor?.type).toBe('truss.arbitration-needed')
		expect(trail?.arbitration?.handle).toBe('arb-auth-rotation')
		expect(trail?.transcript.map((e) => e.type)).toEqual([
			'truss.answer.agree',
			'truss.answer.agree',
			'truss.answer.yield',
		])
		expect(trail?.contributions.map((e) => `${e.stream}#${e.seq}`)).toEqual(['truss-auth#1', 'truss-auth#2'])
	})

	it('gives a decision without arbitration just its replies', () => {
		const trail = provenance(createFixtureStore(), 'm-login#3')
		expect(trail?.arbitration).toBeUndefined()
		expect(trail?.replies.map((e) => e.seq)).toEqual([4, 5])
	})

	it('is undefined for an unknown entry', () => {
		expect(provenance(createFixtureStore(), 'm-login#999')).toBeUndefined()
	})
})
