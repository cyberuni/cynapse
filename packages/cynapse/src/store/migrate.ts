import type { DatabaseSync } from 'node:sqlite'
import { CynapseError } from '../cli-error.js'

/**
 * One forward step of the schema: SQL to run, or a function for a step SQL alone cannot
 * express, such as rewriting rows. It runs inside the migration transaction, so it must
 * not begin or commit one of its own.
 */
export type Migration = string | ((db: DatabaseSync) => void)

/** The schema version the database records, in `PRAGMA user_version`; 0 before versioning. */
export function schemaVersion(db: DatabaseSync): number {
	return (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
}

/**
 * Brings the database to `migrations.length`, running each step past its recorded
 * version in order. Every pending step and the new version commit in one `BEGIN
 * IMMEDIATE` transaction, so a failed step leaves the database where it was, and
 * concurrent openers queue on the write lock: the first migrates, the rest find the work
 * done. A database newer than the code is refused rather than written to.
 *
 * @returns the version the database is at afterwards.
 */
export function migrate(db: DatabaseSync, migrations: readonly Migration[]): number {
	const latest = migrations.length
	db.exec('BEGIN IMMEDIATE')
	try {
		const current = schemaVersion(db)
		if (current > latest) {
			throw new CynapseError(
				`the database is at schema version ${current}, newer than this cynapse knows (${latest}); upgrade cynapse to open it`,
				{ code: 'schema_too_new' },
			)
		}
		for (const step of migrations.slice(current)) {
			if (typeof step === 'string') db.exec(step)
			else step(db)
		}
		if (current < latest) db.exec(`PRAGMA user_version = ${latest}`)
		db.exec('COMMIT')
		return latest
	} catch (error) {
		db.exec('ROLLBACK')
		throw error
	}
}
