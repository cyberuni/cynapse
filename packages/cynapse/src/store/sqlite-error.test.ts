import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { CynapseError, EXIT_FAILURE, helpFor, renderCliError } from '../cli-error.js'
import { SqliteStore } from './sqlite.js'

let dir: string
let path: string

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'cynapse-sqlite-error-'))
	path = join(dir, 'cynapse.db')
})

afterEach(() => {
	rmSync(dir, { recursive: true, force: true })
})

function captureError(fn: () => unknown): unknown {
	try {
		fn()
	} catch (error) {
		return error
	}
	throw new Error('expected a throw')
}

/** Holds the write lock from another connection while `fn` runs. */
function whileLocked(fn: () => void): void {
	const holder = new DatabaseSync(path)
	holder.exec('BEGIN IMMEDIATE')
	try {
		fn()
	} finally {
		holder.exec('ROLLBACK')
		holder.close()
	}
}

it('reports a write that times out on the lock as busy, not as a bug', () => {
	const store = new SqliteStore({ path, busyTimeoutMs: 20 })
	try {
		let error: unknown
		whileLocked(() => {
			error = captureError(() => store.createChannel({ handle: 'w', type: 'demo', title: 'W', author: 'bob' }))
		})
		expect(error).toBeInstanceOf(CynapseError)
		expect(error).toMatchObject({ code: 'busy', exitCode: EXIT_FAILURE })
		expect(helpFor(error)).toMatch(/retry/)
		expect(renderCliError(error, 'json')).not.toMatch(/bug in cynapse/)
	} finally {
		store.close()
	}
})

it('reports an open that must migrate and times out on the lock as busy', () => {
	let error: unknown
	whileLocked(() => {
		error = captureError(() => new SqliteStore({ path, busyTimeoutMs: 20 }))
	})
	expect(error).toBeInstanceOf(CynapseError)
	expect(error).toMatchObject({ code: 'busy', exitCode: EXIT_FAILURE })
})

it('reports a file that is not a database as storage, naming the file', () => {
	writeFileSync(path, 'this is not a database, just some text long enough to fill a header. '.repeat(20))
	const error = captureError(() => new SqliteStore({ path }))
	expect(error).toBeInstanceOf(CynapseError)
	expect(error).toMatchObject({ code: 'storage', exitCode: EXIT_FAILURE })
	expect(helpFor(error)).toContain(path)
	expect(helpFor(error)).toMatch(/integrity_check/)
})

it('leaves an error cynapse raised on purpose as it was', () => {
	const store = new SqliteStore({ path })
	try {
		const error = captureError(() => store.renameChannel('missing', 'x', 'bob'))
		expect(error).toBeInstanceOf(CynapseError)
		expect((error as CynapseError).code).not.toBe('busy')
		expect((error as CynapseError).code).not.toBe('storage')
	} finally {
		store.close()
	}
})
