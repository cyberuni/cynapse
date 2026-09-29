import { describe, expect, it } from 'vitest'
import { createFixtureStore } from './fixture.ts'
import { foldGraph } from './graph.ts'

const graphEntries = () => createFixtureStore().entries('graph-identity')

describe('foldGraph', () => {
	it('derives node status from claims, retirements and the frontier', () => {
		const graph = foldGraph(graphEntries())
		const status = Object.fromEntries(graph.nodes.map((n) => [n.id, n.status]))
		expect(status).toEqual({
			login: 'retired',
			refresh: 'claimed',
			audit: 'ready',
			revocation: 'blocked',
			sso: 'blocked',
		})
		expect(graph.nodes.find((n) => n.id === 'refresh')).toMatchObject({ by: 'builder', stream: 'm-token-refresh' })
	})

	it('carries why a node is ready or held, and tombstones', () => {
		const store = createFixtureStore()
		store.append('graph-identity', {
			author: 'operator',
			type: 'sdd.graph.tombstone',
			body: 'sso dropped',
			data: { node: 'sso', reason: 'out of scope' },
		})
		const graph = foldGraph(store.entries('graph-identity'))
		expect(graph.nodes.find((n) => n.id === 'audit')?.why).toBe('RAW predecessor login retired')
		expect(graph.nodes.find((n) => n.id === 'sso')).toMatchObject({ status: 'tombstoned', outcome: 'out of scope' })
	})

	it('shows an operation as open rather than blocked', () => {
		const store = createFixtureStore()
		store.append('graph-identity', {
			author: 'planner',
			type: 'sdd.graph.node',
			body: 'op',
			data: { node: 'op-identity', kind: 'operation', title: 'Identity', status: 'open' },
		})
		expect(foldGraph(store.entries('graph-identity')).nodes.at(-1)?.status).toBe('open')
	})

	it('keeps the edge kind', () => {
		expect(foldGraph(graphEntries()).edges).toContainEqual({ from: 'login', to: 'refresh', kind: 'RAW' })
	})

	it('steps back through history by seq', () => {
		const entries = graphEntries()
		const firstFrontier = entries.find((e) => e.type === 'sdd.graph.frontier')?.seq ?? 0
		const graph = foldGraph(entries, firstFrontier)
		expect(graph.nodes.find((n) => n.id === 'login')?.status).toBe('ready')
		expect(graph.nodes.find((n) => n.id === 'refresh')?.status).toBe('blocked')
		expect(graph.steps.at(-1)).toBe(entries.at(-1)?.seq)
	})

	it('layers nodes by longest dependency path', () => {
		const layer = Object.fromEntries(foldGraph(graphEntries()).nodes.map((n) => [n.id, n.layer]))
		expect(layer).toEqual({ login: 0, refresh: 1, audit: 1, revocation: 2, sso: 3 })
	})
})
