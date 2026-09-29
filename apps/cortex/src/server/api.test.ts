import { describe, expect, it } from 'vitest'
import { createFixtureStore } from '../core/fixture.ts'
import { createApi } from './api.ts'

const api = () => createApi(createFixtureStore())
const json = async (res: Response | Promise<Response>) => (await res).json()

describe('api', () => {
	it('serves triage for the Council', async () => {
		const body = await json(api().request('/api/triage'))
		expect(body.needsInput).toHaveLength(2)
		expect(body.arbitrations[0].waiting).toEqual(['test-writer'])
	})

	it('serves the stream tree', async () => {
		const body = await json(api().request('/api/tree'))
		expect(body.map((n: { handle: string }) => n.handle)).toContain('init-identity')
	})

	it('serves one stream with its members, waits, children, and pinned entries', async () => {
		const body = await json(api().request('/api/streams/truss-auth'))
		expect(body.stream.handle).toBe('truss-auth')
		expect(body.children.map((c: { handle: string }) => c.handle)).toEqual(['arb-auth-rotation', 'arb-auth-expiry'])
		expect(body.members.length).toBeGreaterThan(0)
		const login = await json(api().request('/api/streams/m-login'))
		expect(login.pinned.map((e: { seq: number }) => e.seq)).toEqual([3])
		expect(login.views).toEqual(['distilled'])
	})

	it('404s an unknown stream', async () => {
		expect((await api().request('/api/streams/nope')).status).toBe(404)
	})

	it('filters entries by view, type and tag', async () => {
		const app = api()
		const distilled = await json(app.request('/api/streams/m-login/entries?view=distilled'))
		expect(distilled.map((e: { type: string }) => e.type)).toEqual(['sdd.decision', 'sdd.outcome'])
		const typed = await json(app.request('/api/streams/m-login/entries?types=sdd.review'))
		expect(typed).toHaveLength(1)
	})

	it('searches across streams', async () => {
		const body = await json(api().request('/api/search?types=truss.decision,sdd.decision'))
		expect(body.map((e: { stream: string; seq: number }) => `${e.stream}#${e.seq}`)).toEqual([
			'm-login#3',
			'truss-auth#5',
		])
	})

	it('lists facets for filtering', async () => {
		const body = await json(api().request('/api/facets'))
		expect(body.types).toContain('truss.decision')
		expect(body.tags).toContain('topic:auth')
	})

	it('serves provenance and the mission graph at a step', async () => {
		const app = api()
		const trail = await json(app.request('/api/provenance/truss-auth/5'))
		expect(trail.arbitration.handle).toBe('arb-auth-rotation')
		const graph = await json(app.request('/api/graph/graph-identity?at=11'))
		expect(graph.at).toBe(11)
	})

	it('writes Council actions back as entries', async () => {
		const app = api()
		const post = (path: string, body: unknown) =>
			app.request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
		expect((await post('/api/streams/m-login/read', {})).status).toBe(200)
		const triage = await json(app.request('/api/triage'))
		expect(triage.unread.find((u: { handle: string }) => u.handle === 'm-login')).toBeUndefined()

		const answered = await json(
			post('/api/answer', { stream: 'm-token-refresh', key: 'revocation', body: 'Whole family.' }),
		)
		expect(answered.type).toBe('council.answer')
		const ruled = await json(post('/api/rule', { ref: 'truss-auth#5', ruling: 'ratify' }))
		expect(ruled.type).toBe('truss.ratify')
		expect((await post('/api/rule', { ref: 'truss-auth#1', ruling: 'ratify' })).status).toBe(400)
	})
})
