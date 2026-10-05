import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CynapseError } from '../cli-error.js'
import { SqliteStore } from './sqlite.js'

const sqliteModule = new URL('./sqlite.ts', import.meta.url).href
let dir: string
let store: SqliteStore

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'cynapse-changes-'))
	store = new SqliteStore({ path: join(dir, 'store.db') })
})

afterEach(() => {
	store.close()
	rmSync(dir, { recursive: true, force: true })
})

function captureError(fn: () => unknown): CynapseError {
	try {
		fn()
	} catch (error) {
		if (error instanceof CynapseError) return error
		throw error
	}
	throw new Error('expected a CynapseError')
}

function channel(handle: string) {
	return store.createChannel({ handle, type: 'test.changes', title: handle, author: 'alice' })
}

const handles = (changes: { channels: { handle: string }[] }) => changes.channels.map((c) => c.handle)

describe('changes', () => {
	it('returns every channel when no token is given', () => {
		channel('a')
		channel('b')
		const all = store.changes()
		expect(all.channels).toEqual([
			{ channelId: store.getChannel('a')?.id, handle: 'a', lastSeq: 1 },
			{ channelId: store.getChannel('b')?.id, handle: 'b', lastSeq: 1 },
		])
	})

	it('returns a token even when the store is empty', () => {
		const empty = store.changes()
		expect(empty.channels).toEqual([])
		expect(store.changes(empty.token).channels).toEqual([])
	})

	it('round-trips its token: nothing changed returns no channels and the same token', () => {
		channel('a')
		const first = store.changes()
		const again = store.changes(first.token)
		expect(again).toEqual({ token: first.token, channels: [] })
	})

	it('returns only the channels whose lastSeq moved after the token', () => {
		channel('a')
		channel('b')
		channel('c')
		const { token } = store.changes()
		store.append('b', { author: 'bob', type: 'test.note' })
		store.append('b', { author: 'bob', type: 'test.note' })
		const next = store.changes(token)
		expect(next.channels).toEqual([{ channelId: store.getChannel('b')?.id, handle: 'b', lastSeq: 3 }])
		expect(next.token).not.toBe(token)
		expect(store.changes(next.token).channels).toEqual([])
	})

	it('counts cynapse.* metadata entries as changes', () => {
		channel('a')
		const entry = store.append('a', { author: 'alice', type: 'test.note' })
		let { token } = store.changes()
		const moves: [string, () => unknown][] = [
			['member', () => store.addMember('a', 'bob', 'reviewer', 'alice')],
			['context', () => store.addContext('a', 'gh:cyberuni/cynapse#30', 'alice')],
			['pin', () => store.pin(entry.id, 'alice')],
			['lifecycle', () => store.setLifecycle('a', 'paused', 'alice')],
			['view', () => store.defineView('a', 'notes', { types: ['test.note'] }, 'alice')],
			['tag', () => store.addTags(entry.id, ['x.y'], 'alice')],
			['untag', () => store.removeTags(entry.id, ['x.y'], 'alice')],
			['state', () => store.setState('a', { key: 'k', kind: 'test.k', status: 'open' }, 'alice')],
			['rename', () => store.renameChannel('a', 'a2', 'alice')],
		]
		for (const [name, move] of moves) {
			move()
			const next = store.changes(token)
			expect({ name, handles: handles(next) }).toEqual({ name, handles: [store.getChannel('a')?.handle] })
			token = next.token
		}
	})

	it('does not count a retried append, which writes nothing', () => {
		channel('a')
		const entry = store.append('a', { author: 'alice', type: 'test.note' })
		const { token } = store.changes()
		store.append('a', { id: entry.id, author: 'alice', type: 'test.note' })
		expect(store.changes(token)).toEqual({ token, channels: [] })
	})

	it('does not count reading, which appends no entry', () => {
		channel('a')
		const { token } = store.changes()
		store.markRead('a', 'bob')
		expect(store.changes(token).channels).toEqual([])
	})

	it('rejects a token from another store', () => {
		channel('a')
		const other = new SqliteStore({ path: join(dir, 'other.db') })
		try {
			const foreign = other.changes().token
			expect(captureError(() => store.changes(foreign))).toMatchObject({ code: 'foreign_token' })
		} finally {
			other.close()
		}
	})

	it('rejects a token it cannot read', () => {
		for (const bad of ['', '12', 'cyn1.not-base64!', store.changes().token.slice(0, -2)]) {
			expect(captureError(() => store.changes(bad))).toMatchObject({ code: 'invalid_token' })
		}
	})

	it('keeps the token opaque: it does not spell the counter', () => {
		channel('a')
		const { token } = store.changes()
		expect(token).not.toMatch(/^\d+$/)
		expect(token.startsWith('cyn1.')).toBe(true)
	})
})

/**
 * One writer, in its own process: waits for the go file, then appends to its own channel
 * and to a shared one, each append in its own write transaction.
 */
const worker = `
import { existsSync } from 'node:fs'
const [db, go, writer, count] = process.argv.slice(1)
const { SqliteStore } = await import(${JSON.stringify(sqliteModule)})
const store = new SqliteStore({ path: db })
process.stdout.write('ready\\n')
const pause = new Int32Array(new SharedArrayBuffer(4))
while (!existsSync(go)) Atomics.wait(pause, 0, 0, 1)
for (let i = 0; i < Number(count); i++) {
	store.append(i % 2 ? 'shared' : writer, { author: writer, type: 'test.tick' })
}
store.close()
process.stdout.write('done')
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
	const done = new Promise<void>((resolve, reject) => {
		child.on('error', reject)
		child.on('close', (code) => {
			if (code === 0) resolve()
			else reject(new Error(`worker exited ${code}: ${`${stdout}\n${stderr}`.trim()}`))
		})
	})
	return { ready, done }
}

it('never loses a bump across concurrent writer processes', { timeout: 60_000 }, async () => {
	const path = join(dir, 'race.db')
	const go = join(dir, 'go')
	const writers = ['w0', 'w1', 'w2', 'w3', 'w4', 'w5']
	const setup = new SqliteStore({ path })
	setup.createChannel({ handle: 'shared', type: 'test.race', title: 'shared', author: 'test' })
	for (const writer of writers)
		setup.createChannel({ handle: writer, type: 'test.race', title: writer, author: 'test' })
	const before = setup.changes()
	setup.close()

	const workers = writers.map((writer) => startWorker([path, go, writer, '30']))
	await Promise.all(workers.map((w) => w.ready))
	writeFileSync(go, '')

	// Poll while they write, the way a runtime would, and keep the last lastSeq seen per channel.
	const poller = new SqliteStore({ path })
	const seen = new Map<string, number>()
	let token = before.token
	const poll = () => {
		const next = poller.changes(token)
		for (const c of next.channels) seen.set(c.handle, c.lastSeq)
		token = next.token
	}
	let finished = false
	const all = Promise.all(workers.map((w) => w.done)).finally(() => {
		finished = true
	})
	while (!finished) {
		poll()
		await new Promise((resolve) => setTimeout(resolve, 5))
	}
	await all
	poll()
	poller.close()

	const db = new DatabaseSync(path)
	try {
		const { entries } = db.prepare('SELECT COUNT(*) AS entries FROM entries').get() as { entries: number }
		const { change } = db.prepare('SELECT change FROM store_clock').get() as { change: number }
		// Every append took its own bump: the counter is the number of entries ever written.
		expect(change).toBe(entries)
		const lastSeqs = db
			.prepare('SELECT handle, (SELECT MAX(seq) FROM entries WHERE channel = c.id) AS lastSeq FROM channels c')
			.all() as {
			handle: string
			lastSeq: number
		}[]
		expect(Object.fromEntries(seen)).toEqual(Object.fromEntries(lastSeqs.map((c) => [c.handle, c.lastSeq])))
	} finally {
		db.close()
	}
})
