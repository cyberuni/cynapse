import { CynapseError } from '../cli-error.js'

// SQLite's primary result codes; an extended code keeps the primary in its low byte.
const SQLITE_BUSY = 5
const SQLITE_LOCKED = 6
const SQLITE_IOERR = 10
const SQLITE_CORRUPT = 11
const SQLITE_FULL = 13
const SQLITE_NOTADB = 26

/**
 * Turns an error SQLite raised itself into a coded CynapseError, so a caller can tell
 * "retry later" (`busy`) and "the file needs looking at" (`storage`) from a bug in
 * cynapse. Anything else, a CynapseError included, comes back unchanged.
 */
export function toStoreError(error: unknown, path: string): unknown {
	const errcode = (error as { errcode?: unknown } | undefined)?.errcode
	if (error instanceof CynapseError || !(error instanceof Error) || typeof errcode !== 'number') return error
	switch (errcode & 0xff) {
		case SQLITE_BUSY:
		case SQLITE_LOCKED:
			return new CynapseError(error.message, { code: 'busy', cause: error })
		case SQLITE_IOERR:
		case SQLITE_CORRUPT:
		case SQLITE_FULL:
		case SQLITE_NOTADB:
			return new CynapseError(error.message, {
				code: 'storage',
				cause: error,
				help: `check the database file ${path}: free disk space if the disk is full, then run \`sqlite3 '${path}' "PRAGMA integrity_check"\`; restore it from a backup if the check fails`,
			})
		default:
			return error
	}
}
