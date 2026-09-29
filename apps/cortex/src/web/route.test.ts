import { describe, expect, it } from 'vitest'
import { parseRoute, type Route, routeHref } from './route.ts'

describe('parseRoute', () => {
	it('parses every view', () => {
		expect(parseRoute('/', '', '')).toEqual({ view: 'triage' })
		expect(parseRoute('/tree', '', '')).toEqual({ view: 'tree' })
		expect(parseRoute('/s/m-login', '', '#3')).toEqual({ view: 'stream', handle: 'm-login', seq: 3 })
		expect(parseRoute('/s/truss-auth', '?side=arb-auth-expiry', '')).toEqual({
			view: 'stream',
			handle: 'truss-auth',
			side: 'arb-auth-expiry',
		})
		expect(parseRoute('/p/truss-auth/5', '', '')).toEqual({ view: 'provenance', handle: 'truss-auth', seq: 5 })
		expect(parseRoute('/g/graph-identity', '?at=9', '')).toEqual({ view: 'graph', handle: 'graph-identity', at: 9 })
		expect(parseRoute('/search', '?types=truss.decision&tags=topic:auth', '')).toEqual({
			view: 'search',
			types: ['truss.decision'],
			tags: ['topic:auth'],
		})
	})

	it('falls back to triage for an unknown path', () => {
		expect(parseRoute('/nope', '', '')).toEqual({ view: 'triage' })
	})
})

describe('routeHref', () => {
	it('round-trips through parseRoute', () => {
		const routes = [
			{ view: 'stream', handle: 'm-login', seq: 3 },
			{ view: 'stream', handle: 'truss-auth', side: 'arb-auth-expiry' },
			{ view: 'graph', handle: 'graph-identity', at: 9 },
			{ view: 'search', types: ['sdd.decision'], tags: [] },
		] satisfies Route[]
		for (const route of routes) {
			const url = new URL(routeHref(route), 'http://x')
			expect(parseRoute(url.pathname, url.search, url.hash)).toEqual(
				route.view === 'search' ? { view: 'search', types: ['sdd.decision'], tags: [] } : route,
			)
		}
	})
})
