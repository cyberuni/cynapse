import { describe, expect, it } from 'vitest'
import { createFixtureStore } from '../core/fixture.ts'
import { createApi } from './api.ts'

const api = () => createApi(createFixtureStore(), { port: 5173 })
const post = (url: string, headers: Record<string, string>, body = '{}') =>
	api().request(url, { method: 'POST', headers, body })
const JSON_TYPE = { 'content-type': 'application/json' }

describe('local-only guard', () => {
	it('serves reads to localhost and 127.0.0.1 on the served port', async () => {
		expect((await api().request('http://localhost:5173/api/triage')).status).toBe(200)
		expect((await api().request('http://127.0.0.1:5173/api/triage')).status).toBe(200)
	})

	it('refuses another host, which is how DNS rebinding arrives', async () => {
		const res = await api().request('http://evil.example:5173/api/triage')
		expect(res.status).toBe(403)
		expect(await res.json()).toEqual({ error: expect.stringMatching(/host/i) })
	})

	it('refuses the right host on the wrong port', async () => {
		expect((await api().request('http://localhost:8080/api/triage')).status).toBe(403)
	})

	it('refuses a write that is not JSON, such as a cross-site form post', async () => {
		const res = await post('http://localhost:5173/api/channels/m-login/read', { 'content-type': 'text/plain' })
		expect(res.status).toBe(403)
		expect(await res.json()).toEqual({ error: expect.stringMatching(/application\/json/) })
	})

	it('refuses a write from another origin', async () => {
		const res = await post('http://localhost:5173/api/channels/m-login/read', {
			...JSON_TYPE,
			origin: 'https://evil.example',
		})
		expect(res.status).toBe(403)
		expect(await res.json()).toEqual({ error: expect.stringMatching(/origin/i) })
	})

	it('accepts a JSON write from the served origin, or with no Origin at all', async () => {
		const same = await post('http://localhost:5173/api/channels/m-login/read', {
			...JSON_TYPE,
			origin: 'http://localhost:5173',
		})
		expect(same.status).toBe(200)
		const agent = await post('http://127.0.0.1:5173/api/channels/m-login/read', JSON_TYPE)
		expect(agent.status).toBe(200)
	})
})
