import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStore, SEED_START, SeedClock, seed } from 'cynapse'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApi } from './api.ts'
import { openCortexStore } from './store.ts'

let dir: string
let db: string

beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), 'cortex-'))
	db = join(dir, 'cynapse.db')
	const clock = new SeedClock(SEED_START)
	const store = openStore({ path: db, clock: clock.now })
	seed(store, clock)
	store.close()
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('openCortexStore', () => {
	it('opens the cynapse database named by CORTEX_DB', () => {
		const { store, label } = openCortexStore({ CORTEX_DB: db })
		expect(label).toBe(db)
		expect(store.getChannel('graph-agent-comms')?.type).toBe('sdd.mission-graph')
	})

	it('explains how to get a database when there is none', () => {
		expect(() => openCortexStore({ CORTEX_DB: join(dir, 'missing.db') })).toThrow(/`pnpm seed`/)
	})
})

describe('the API on the seed database', () => {
	const api = () => createApi(openCortexStore({ CORTEX_DB: db }).store)
	const json = async (path: string) => (await api().request(path)).json()

	it('triages what needs the Council', async () => {
		const triage = await json('/api/triage')
		expect(triage.needsInput.map((n: { handle: string }) => n.handle).sort()).toEqual([
			'm-channel-ids',
			'truss-pagination-arb-2',
		])
		expect(triage.arbitrations).toEqual([
			expect.objectContaining({ handle: 'truss-pagination-arb-2', state: 'escalated', split: true }),
		])
	})

	it('follows a truss decision to its arbitration and contributions', async () => {
		const [decision] = await json('/api/search?types=truss.decision')
		const trail = await json(`/api/provenance/${decision.channel}/${decision.seq}`)
		expect(trail.arbitration.handle).toBe('truss-pagination-arb-1')
		expect(trail.contributions.length).toBeGreaterThan(0)
		expect(trail.contributions.every((e: { type: string }) => !e.type.startsWith('cynapse.'))).toBe(true)
	})

	it('folds the mission graph', async () => {
		const graph = await json('/api/graph/graph-agent-comms')
		const status = Object.fromEntries(graph.nodes.map((n: { id: string; status: string }) => [n.id, n.status]))
		expect(status).toMatchObject({ 'op-store': 'open', 'm-channel-ids': 'claimed', 'm-dm-dedup': 'tombstoned' })
	})
})
