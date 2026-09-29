import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openStore } from '../store/open.js'
import type { Store } from '../store/types.js'
import { SEED_START, SeedClock, seed } from './seed.js'

let store: Store
let clock: SeedClock

beforeEach(() => {
	clock = new SeedClock(SEED_START)
	store = openStore({ path: ':memory:', clock: clock.now })
})

afterEach(() => {
	store.close()
})

describe(seed.name, () => {
	it('builds the SDD hierarchy as anchored child streams', () => {
		seed(store, clock)
		const [initiative] = store.tree('init-agent-comms')
		expect(initiative?.children.map((c) => c.stream.handle)).toEqual(['epic-store', 'epic-viewer'])
		expect(initiative?.children[0]?.children.map((c) => c.stream.handle)).toEqual(['m-seq-order', 'm-stream-ids'])
		const mission = store.getStream('m-seq-order')
		expect(store.entry(mission?.parent?.entryId as string)?.type).toBe('sdd.mission.opened')
	})

	it('reconciles one mission with a distilled view over its raw ledger', () => {
		seed(store, clock)
		expect(store.getStream('m-seq-order')?.state).toBe('reconciled')
		const raw = store.entries('m-seq-order')
		const distilled = store.entries('m-seq-order', { view: 'distilled' })
		expect(distilled.length).toBeGreaterThan(0)
		expect(distilled.length).toBeLessThan(raw.length)
		expect(new Set(distilled.map((e) => e.type))).toEqual(
			new Set(['sdd.leash', 'sdd.gate', 'sdd.decision', 'sdd.followup', 'sdd.strategy', 'cynapse.summary']),
		)
	})

	it('records the mission graph so the frontier can be replayed', () => {
		seed(store, clock)
		const types = new Set(store.entries('graph-agent-comms').map((e) => e.type))
		for (const type of [
			'sdd.graph.node',
			'sdd.graph.edge',
			'sdd.graph.frontier',
			'sdd.graph.claim',
			'sdd.graph.retire',
		]) {
			expect(types).toContain(type)
		}
	})

	it('writes each truss decision back to the mission, pointing at its arbitration anchor', () => {
		seed(store, clock)
		const arbitration = store.getStream('truss-pagination-arb-1')
		const decision = store.entries('truss-pagination', { types: ['truss.decision'] })[0]
		expect(decision?.parent).toBe(arbitration?.parent?.entryId)
		expect(arbitration?.members.map((m) => m.role)).toContain('elector')
		const answers = store.search({ types: ['truss.answer.*'] }).map((e) => e.type)
		expect(new Set(answers)).toEqual(
			new Set(['truss.answer.agree', 'truss.answer.disagree', 'truss.answer.yield', 'truss.answer.request-recess']),
		)
	})

	it('leaves decisions pending and items unread for the Council', () => {
		const summary = seed(store, clock)
		const open = store.states({ kind: 'needs-input', status: 'open', subject: 'council' })
		expect(open.map((s) => store.getStream(s.streamId)?.handle).sort()).toEqual([
			'm-stream-ids',
			'truss-pagination-arb-2',
		])
		expect(summary.councilUnread).toBeGreaterThan(0)
		expect(store.states({ kind: 'pending-answers' }).length).toBeGreaterThan(0)
	})

	it('lays the entries out over time rather than in one instant', () => {
		seed(store, clock)
		const entries = store.entries('m-seq-order')
		expect(
			Date.parse(entries.at(-1)?.createdAt as string) - Date.parse(entries[0]?.createdAt as string),
		).toBeGreaterThan(60 * 60_000)
	})
})
