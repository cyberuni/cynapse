import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { SqliteStore } from './sqlite.js'

const sqliteModule = new URL('./sqlite.ts', import.meta.url).href
let dir: string | undefined

afterEach(() => {
	if (dir) rmSync(dir, { recursive: true, force: true })
})

/**
 * One racing writer, in its own process: says it is ready, waits for the go file, then
 * tries to rule on every decision, the way separate GUI or CLI processes would.
 */
const worker = `
import { existsSync } from 'node:fs'
const [db, go, writer, ...decisions] = process.argv.slice(1)
const { SqliteStore } = await import(${JSON.stringify(sqliteModule)})
const store = new SqliteStore({ path: db })
process.stdout.write('ready\\n')
const pause = new Int32Array(new SharedArrayBuffer(4))
while (!existsSync(go)) Atomics.wait(pause, 0, 0, 1)
let won = 0
for (const id of decisions) {
	const ruling = writer.endsWith('o') ? 'override' : 'ratify'
	const result = store.appendUnless(
		'rulings',
		{ author: writer, type: 'sdd.' + ruling, parent: id, body: writer },
		{ parent: id, types: ['sdd.ratify', 'sdd.override'] },
	)
	if (result.appended) won++
}
store.close()
process.stdout.write(JSON.stringify({ writer, won }) + '\\n')
`

function startWorker(args: string[]) {
	const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', worker, ...args], {
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	let stdout = ''
	let stderr = ''
	let onReady: () => void
	const ready = new Promise<void>((resolve) => {
		onReady = resolve
	})
	child.stdout.on('data', (chunk) => {
		stdout += chunk
		if (stdout.startsWith('ready\n')) onReady()
	})
	child.stderr.on('data', (chunk) => {
		stderr += chunk
	})
	const done = new Promise<{ writer: string; won: number }>((resolve, reject) => {
		child.on('error', reject)
		child.on('close', (code) => {
			if (code === 0) resolve(JSON.parse(stdout.slice('ready\n'.length)))
			else reject(new Error(`worker exited ${code}: ${`${stdout}\n${stderr}`.trim()}`))
		})
	})
	return { ready, done }
}

it('lands at most one ruling per decision across concurrent writer processes', { timeout: 60_000 }, async () => {
	dir = mkdtempSync(join(tmpdir(), 'cynapse-race-'))
	const db = join(dir, 'race.db')
	const go = join(dir, 'go')
	const setup = new SqliteStore({ path: db })
	setup.createChannel({ handle: 'rulings', type: 'test.race', title: 'Racing rulings', author: 'test' })
	const decisions = Array.from(
		{ length: 40 },
		(_, i) => setup.append('rulings', { author: 'agent', type: 'sdd.decision', body: `d${i}` }).id,
	)
	setup.close()

	const workers = ['w0', 'w1o', 'w2', 'w3o', 'w4', 'w5o', 'w6', 'w7o'].map((writer) =>
		startWorker([db, go, writer, ...decisions]),
	)
	await Promise.all(workers.map((w) => w.ready))
	writeFileSync(go, '')
	const results = await Promise.all(workers.map((w) => w.done))

	const store = new SqliteStore({ path: db })
	try {
		const rulings = store.entries('rulings', { types: ['sdd.ratify', 'sdd.override'] })
		const perDecision = decisions.map((id) => rulings.filter((r) => r.parent === id).length)
		expect(perDecision).toEqual(decisions.map(() => 1))
		expect(results.reduce((sum, r) => sum + r.won, 0)).toBe(decisions.length)
		expect(store.integrityCheck()).toBe('ok')
	} finally {
		store.close()
	}
})
