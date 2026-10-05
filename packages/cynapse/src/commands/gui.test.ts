import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CynapseError, EXIT_USAGE } from '../cli-error.js'
import { setOutputFormat } from '../output.js'
import { createProgram } from '../program.js'
import type { Store } from '../store/types.js'
import { GUI_PACKAGE, loadGui, onStop, openBrowser } from './gui-host.js'

vi.mock('./gui-host.js', async (original) => ({
	...(await original<typeof import('./gui-host.js')>()),
	loadGui: vi.fn(),
	openBrowser: vi.fn(),
	onStop: vi.fn(),
}))

let dir: string
let db: string
let log: ReturnType<typeof vi.spyOn>
const close = vi.fn(async () => {})
const start = vi.fn(async ({ port = 4173 }: { store: Store; port?: number }) => ({
	url: `http://127.0.0.1:${port}`,
	close,
}))

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'cynapse-gui-'))
	db = join(dir, 'test.db')
	log = vi.spyOn(console, 'log').mockImplementation(() => {})
	vi.mocked(loadGui).mockResolvedValue({ start })
})

afterEach(() => {
	setOutputFormat('text')
	vi.clearAllMocks()
	vi.restoreAllMocks()
	rmSync(dir, { recursive: true, force: true })
})

async function gui(...args: string[]): Promise<string> {
	await createProgram('0.0.0').parseAsync(['node', 'cynapse', '--db', db, 'gui', ...args])
	return log.mock.calls.map((call: unknown[]) => String(call[0])).join('\n')
}

/** Runs what `onStop` was handed, as Ctrl-C would. */
async function stop() {
	await vi.mocked(onStop).mock.calls[0]?.[0]()
}

describe('cynapse gui', () => {
	it('starts the GUI on the store of --db and opens the browser', async () => {
		expect(await gui()).toContain('http://127.0.0.1:4173')
		expect(start).toHaveBeenCalledWith(expect.objectContaining({ port: 4173 }))
		expect(start.mock.calls[0]?.[0].store.listChannels()).toEqual([])
		expect(openBrowser).toHaveBeenCalledWith('http://127.0.0.1:4173')
		await stop()
	})

	it('takes --port and --no-open', async () => {
		await gui('--port', '8080', '--no-open')
		expect(start).toHaveBeenCalledWith(expect.objectContaining({ port: 8080 }))
		expect(openBrowser).not.toHaveBeenCalled()
		await stop()
	})

	it('prints the URL as JSON under --json', async () => {
		await createProgram('0.0.0').parseAsync(['node', 'cynapse', '--db', db, '--json', 'gui', '--no-open'])
		expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({ url: 'http://127.0.0.1:4173' })
		await stop()
	})

	it('closes the server and the store on stop', async () => {
		await gui('--no-open')
		const store = start.mock.calls[0]?.[0].store as Store
		await stop()
		expect(close).toHaveBeenCalled()
		expect(() => store.listChannels()).toThrow()
	})

	it('says how to install the GUI when it is missing', async () => {
		vi.mocked(loadGui).mockRejectedValue(
			Object.assign(new Error(`Cannot find package '${GUI_PACKAGE}'`), { code: 'ERR_MODULE_NOT_FOUND' }),
		)
		const error = await gui().catch((e: unknown) => e)
		expect(error).toBeInstanceOf(CynapseError)
		expect((error as CynapseError).code).toBe('gui_not_installed')
		expect((error as CynapseError).message).toContain(`npm install -g ${GUI_PACKAGE}`)
	})

	it('passes through any other failure to load the GUI', async () => {
		vi.mocked(loadGui).mockRejectedValue(
			Object.assign(new Error("Cannot find package 'hono'"), { code: 'ERR_MODULE_NOT_FOUND' }),
		)
		await expect(gui()).rejects.toThrow("Cannot find package 'hono'")
	})

	it('names --port when the port is taken, and releases the store', async () => {
		start.mockRejectedValueOnce(Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' }))
		const error = await gui().catch((e: unknown) => e)
		expect(error).toBeInstanceOf(CynapseError)
		expect((error as CynapseError).code).toBe('port_in_use')
		expect((error as CynapseError).message).toContain('--port')
		expect(onStop).not.toHaveBeenCalled()
	})

	it('rejects a port that is not a number as a usage error', async () => {
		const error = await gui('--port', 'abc').catch((e: unknown) => e)
		expect((error as CynapseError).exitCode).toBe(EXIT_USAGE)
		expect(loadGui).not.toHaveBeenCalled()
	})
})
