import { DatabaseSync } from 'node:sqlite'

export interface ConnectOptions {
	/** How long to wait for another connection's lock before failing. */
	busyTimeoutMs?: number
}

const SQLITE_BUSY = 5

/** Opens the database file with the connection settings every store connection uses. */
export function connect(path: string, options: ConnectOptions = {}): DatabaseSync {
	const busyTimeoutMs = options.busyTimeoutMs ?? 10_000
	const db = new DatabaseSync(path)
	try {
		db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`)
		enableWal(db, busyTimeoutMs)
		db.exec('PRAGMA synchronous = NORMAL')
		db.exec('PRAGMA foreign_keys = ON')
		// Overwrite freed content, so an erased entry does not linger in free pages (ADR-0014).
		db.exec('PRAGMA secure_delete = ON')
	} catch (error) {
		db.close()
		throw error
	}
	return db
}

/**
 * Switches the file to WAL. When several processes switch a fresh file at once, SQLite
 * hands the losers `SQLITE_BUSY` at once instead of waiting out `busy_timeout`, so the
 * wait is ours: retry until the timeout, by which point the winner has made it WAL.
 */
function enableWal(db: DatabaseSync, busyTimeoutMs: number): void {
	const deadline = Date.now() + busyTimeoutMs
	const pause = new Int32Array(new SharedArrayBuffer(4))
	for (let delay = 1; ; delay = Math.min(delay * 2, 50)) {
		try {
			db.exec('PRAGMA journal_mode = WAL')
			return
		} catch (error) {
			if (!isBusy(error) || Date.now() >= deadline) throw error
			Atomics.wait(pause, 0, 0, delay)
		}
	}
}

function isBusy(error: unknown): boolean {
	const code = (error as { errcode?: unknown }).errcode
	return typeof code === 'number' && (code & 0xff) === SQLITE_BUSY
}
