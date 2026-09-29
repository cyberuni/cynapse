import { homedir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from './sqlite.js'
import type { Store } from './types.js'

/** `$CYNAPSE_HOME/cynapse.db`, where `CYNAPSE_HOME` defaults to `~/.cynapse`. */
export function resolveDbPath(env: NodeJS.ProcessEnv = process.env): string {
	return join(env.CYNAPSE_HOME || join(homedir(), '.cynapse'), 'cynapse.db')
}

export interface OpenStoreOptions {
	/** The database file; defaults to `resolveDbPath()`. `:memory:` for a throwaway store. */
	path?: string
	/** Milliseconds since the epoch; overridable to lay out a timeline. */
	clock?: () => number
}

export function openStore(options: OpenStoreOptions = {}): Store {
	return new SqliteStore({ path: options.path ?? resolveDbPath(), clock: options.clock })
}
