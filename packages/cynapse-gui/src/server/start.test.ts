import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFixtureStore } from '../core/fixture.ts'
import { type Gui, start } from './start.ts'

let webRoot: string
let gui: Gui | undefined

beforeEach(() => {
	webRoot = mkdtempSync(join(tmpdir(), 'cynapse-gui-'))
	writeFileSync(join(webRoot, 'index.html'), '<title>cynapse</title>')
	mkdirSync(join(webRoot, 'assets'))
	writeFileSync(join(webRoot, 'assets', 'app.js'), 'console.log(1)')
})

afterEach(async () => {
	await gui?.close()
	gui = undefined
	rmSync(webRoot, { recursive: true, force: true })
})

/** A port nothing is listening on, found by letting the OS pick one and releasing it. */
function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = createServer()
		probe.once('error', reject)
		probe.listen(0, '127.0.0.1', () => {
			const address = probe.address()
			probe.close(() => resolve(typeof address === 'object' && address ? address.port : 0))
		})
	})
}

describe('start', () => {
	it('serves the API and the UI on one loopback port', async () => {
		const port = await freePort()
		gui = await start({ store: createFixtureStore(), port, webRoot })
		expect(gui.url).toBe(`http://127.0.0.1:${port}`)

		const triage = await (await fetch(`${gui.url}/api/triage`)).json()
		expect(triage.needsInput).toHaveLength(2)
		expect(await (await fetch(`${gui.url}/assets/app.js`)).text()).toBe('console.log(1)')
	})

	it('answers any other path with the UI, so a deep link survives a reload', async () => {
		gui = await start({ store: createFixtureStore(), port: await freePort(), webRoot })
		expect(await (await fetch(`${gui.url}/s/truss-auth`)).text()).toBe('<title>cynapse</title>')
	})

	it('keeps the host guard on the served port', async () => {
		const port = await freePort()
		gui = await start({ store: createFixtureStore(), port, webRoot })
		// fetch ignores a Host header, so this goes through node:http.
		const status = await new Promise<number | undefined>((resolve, reject) => {
			request({ port, host: '127.0.0.1', path: '/api/triage', headers: { host: `127.0.0.1:${port + 1}` } }, (res) => {
				res.resume()
				resolve(res.statusCode)
			})
				.once('error', reject)
				.end()
		})
		expect(status).toBe(403)
	})

	it('rejects when the port is taken', async () => {
		const port = await freePort()
		gui = await start({ store: createFixtureStore(), port, webRoot })
		await expect(start({ store: createFixtureStore(), port, webRoot })).rejects.toMatchObject({ code: 'EADDRINUSE' })
	})

	it('releases the port on close', async () => {
		const port = await freePort()
		await (await start({ store: createFixtureStore(), port, webRoot })).close()
		gui = await start({ store: createFixtureStore(), port, webRoot })
		expect((await fetch(`${gui.url}/api/triage`)).status).toBe(200)
	})
})
