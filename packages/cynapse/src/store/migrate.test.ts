import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CynapseError } from '../cli-error.js'
import { type Migration, migrate, schemaVersion } from './migrate.js'
import { MIGRATIONS, SCHEMA_VERSION } from './schema.js'
import { SqliteStore } from './sqlite.js'

const migrateModule = new URL('./migrate.ts', import.meta.url).href
let dir: string

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'cynapse-migrate-'))
})

afterEach(() => {
	rmSync(dir, { recursive: true, force: true })
})

function readVersion(path: string): number {
	const db = new DatabaseSync(path)
	try {
		return schemaVersion(db)
	} finally {
		db.close()
	}
}

/** A database as the code before versioning left it: today's tables, `user_version` 0. */
function unversionedDatabase(path: string): void {
	const db = new DatabaseSync(path)
	db.exec(MIGRATIONS[0] as string)
	db.exec(`INSERT INTO participants (id, kind, name) VALUES ('alice', 'human', 'Alice')`)
	db.close()
}

describe('schema version', () => {
	it('versions the schema by its migrations', () => {
		expect(SCHEMA_VERSION).toBe(MIGRATIONS.length)
		expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(1)
	})

	it('brings a fresh database to the latest version', () => {
		const path = join(dir, 'fresh.db')
		new SqliteStore({ path }).close()
		expect(readVersion(path)).toBe(SCHEMA_VERSION)
	})

	it('upgrades a database built before versioning, keeping its rows', () => {
		const path = join(dir, 'v1.db')
		unversionedDatabase(path)
		expect(readVersion(path)).toBe(0)

		const store = new SqliteStore({ path })
		expect(store.participants()).toEqual([{ id: 'alice', kind: 'human', name: 'Alice' }])
		store.close()
		expect(readVersion(path)).toBe(SCHEMA_VERSION)
	})

	it('reopens a current database without changing it', () => {
		const path = join(dir, 'reopen.db')
		const first = new SqliteStore({ path })
		first.createChannel({ handle: 'auth', type: 'sdd.mission', title: 'Add auth', author: 'alice' })
		first.close()

		const second = new SqliteStore({ path })
		expect(second.entries('auth')).toHaveLength(1)
		second.close()
		expect(readVersion(path)).toBe(SCHEMA_VERSION)
	})

	it('refuses a database newer than the code knows', () => {
		const path = join(dir, 'newer.db')
		new SqliteStore({ path }).close()
		const db = new DatabaseSync(path)
		db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`)
		db.close()

		let error: unknown
		try {
			new SqliteStore({ path })
		} catch (caught) {
			error = caught
		}
		expect(error).toBeInstanceOf(CynapseError)
		expect(error).toMatchObject({ code: 'schema_too_new' })
		expect((error as Error).message).toContain(`version ${SCHEMA_VERSION + 1}`)
		expect(readVersion(path)).toBe(SCHEMA_VERSION + 1)
	})
})

describe('migrate', () => {
	const v1: Migration = 'CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY) STRICT;'

	it('runs only the migrations past the recorded version, in order', () => {
		const db = new DatabaseSync(':memory:')
		expect(migrate(db, [v1])).toBe(1)
		db.exec(`INSERT INTO notes VALUES ('a')`)

		const applied: number[] = []
		const later: Migration[] = [
			v1,
			'ALTER TABLE notes ADD COLUMN body TEXT',
			(handle) => {
				applied.push(schemaVersion(handle))
				handle.exec(`UPDATE notes SET body = 'filled'`)
			},
		]
		expect(migrate(db, later)).toBe(3)
		expect(applied).toEqual([1])
		expect(db.prepare('SELECT id, body FROM notes').all()).toEqual([{ id: 'a', body: 'filled' }])
		expect(migrate(db, later)).toBe(3)
		db.close()
	})

	it('rolls back every step of a failed run, leaving the version where it was', () => {
		const db = new DatabaseSync(':memory:')
		migrate(db, [v1])
		expect(() => migrate(db, [v1, 'ALTER TABLE notes ADD COLUMN body TEXT', 'NOT SQL'])).toThrow()
		expect(schemaVersion(db)).toBe(1)
		expect(db.prepare(`SELECT name FROM pragma_table_info('notes')`).all()).toEqual([{ name: 'id' }])
		db.close()
	})
})

/**
 * One opener, in its own process: waits for the go file, then migrates with a step that
 * is not idempotent, so a second run of it would leave a second row.
 */
const opener = `
import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
const [path, go] = process.argv.slice(1)
const { migrate } = await import(${JSON.stringify(migrateModule)})
const db = new DatabaseSync(path)
db.exec('PRAGMA busy_timeout = 10000')
process.stdout.write('ready\\n')
const pause = new Int32Array(new SharedArrayBuffer(4))
while (!existsSync(go)) Atomics.wait(pause, 0, 0, 1)
db.exec('PRAGMA journal_mode = WAL')
const version = migrate(db, [
	'CREATE TABLE runs (pid INTEGER NOT NULL) STRICT',
	(handle) => handle.prepare('INSERT INTO runs VALUES (?)').run(process.pid),
])
db.close()
process.stdout.write(String(version))
`

function startOpener(path: string, go: string) {
	const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', opener, path, go], {
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
	const done = new Promise<string>((resolve, reject) => {
		child.on('error', reject)
		child.on('close', (code) => {
			if (code === 0) resolve(stdout.slice('ready\n'.length))
			else reject(new Error(`opener exited ${code}: ${`${stdout}\n${stderr}`.trim()}`))
		})
	})
	return { ready, done }
}

it('migrates once when several processes open a fresh database together', { timeout: 60_000 }, async () => {
	const path = join(dir, 'race.db')
	const go = join(dir, 'go')
	const openers = Array.from({ length: 6 }, () => startOpener(path, go))
	await Promise.all(openers.map((o) => o.ready))
	writeFileSync(go, '')

	expect(await Promise.all(openers.map((o) => o.done))).toEqual(Array(6).fill('2'))
	const db = new DatabaseSync(path)
	expect(schemaVersion(db)).toBe(2)
	expect(db.prepare('SELECT count(*) AS n FROM runs').get()).toEqual({ n: 1 })
	db.close()
})
