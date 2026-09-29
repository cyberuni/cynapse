import { readFileSync } from 'node:fs'
import type { Command } from 'commander'
import { CynapseError, EXIT_USAGE } from '../cli-error.js'
import { openStore } from '../store/open.js'
import type { Store } from '../store/types.js'

/** Global options every command can read from the root program. */
interface GlobalOptions {
	db?: string
	as?: string
}

function globals(command: Command): GlobalOptions {
	return command.optsWithGlobals<GlobalOptions>()
}

/** Opens the store for one command and always closes it, even when the command throws. */
export async function withStore<T>(command: Command, fn: (store: Store) => T | Promise<T>): Promise<T> {
	const store = openStore({ path: globals(command).db })
	try {
		return await fn(store)
	} finally {
		store.close()
	}
}

/** The participant a command acts as: `--as`, else `$CYNAPSE_PARTICIPANT`. */
export function actor(command: Command): string {
	const as = globals(command).as ?? process.env.CYNAPSE_PARTICIPANT
	if (!as) {
		throw new CynapseError('no participant: pass --as <participant> or set CYNAPSE_PARTICIPANT', {
			exitCode: EXIT_USAGE,
		})
	}
	return as
}

/** `--as` when given, without requiring it. */
export function optionalActor(command: Command): string | undefined {
	return globals(command).as ?? process.env.CYNAPSE_PARTICIPANT
}

/** Commander accumulator for a repeatable option (`--tag a --tag b`). */
export function collect(value: string, previous: string[] = []): string[] {
	return [...previous, value]
}

export function parseJson(value: string, flag: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(value) as unknown
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
	} catch (error) {
		throw new CynapseError(`${flag} is not valid JSON`, { exitCode: EXIT_USAGE, cause: error })
	}
	throw new CynapseError(`${flag} must be a JSON object`, { exitCode: EXIT_USAGE })
}

export function parseInteger(value: string, flag: string): number {
	const n = Number(value)
	if (!Number.isInteger(n) || n < 0) throw new CynapseError(`${flag} must be a whole number`, { exitCode: EXIT_USAGE })
	return n
}

/** `--body-file -` reads stdin. */
export function readBodyFile(path: string): string {
	return readFileSync(path === '-' ? 0 : path, 'utf8')
}
