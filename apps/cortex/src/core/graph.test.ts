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
		expect(graph.nodes.find((n) => n.id === 'refresh')).toMatchObject({ by: 'builder', mission: 'm-token-refresh' })
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
