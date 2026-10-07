import type { OutputFormat } from './output.js'

/**
 * Exit codes the CLI is allowed to return. Agents branch on these, so the set stays
 * small and stable: anything new needs a reason a caller can act on differently.
 */
export const EXIT_OK = 0
export const EXIT_FAILURE = 1
export const EXIT_USAGE = 2
/** `entry wait` ran out of time with no reply; waiting again may still get one. */
export const EXIT_TIMEOUT = 3
/**
 * A name resolved to more than one live participant (`ambiguous_address`). The error lists
 * every candidate; pass a more specific name, an id, or narrow by kind.
 */
export const EXIT_AMBIGUOUS_ADDRESS = 4
/** A name resolved to no live participant (`unknown_address`); check the name or register it. */
export const EXIT_UNKNOWN_ADDRESS = 5

/** A failure the CLI raised deliberately, with an exit code a caller can branch on. */
export class CynapseError extends Error {
	readonly exitCode: number
	/** A stable, machine-readable reason, such as `id_conflict`, for callers that branch on more than the exit code. */
	readonly code?: string
	/** Structured facts a caller acts on, such as an ambiguous address's `candidates`; rendered under `--json`. */
	readonly details?: Record<string, unknown>
	/** The next step to suggest, such as the command to run; without one, `helpFor` gives the code's default. */
	readonly help?: string

	constructor(
		message: string,
		options: {
			exitCode?: number
			cause?: unknown
			code?: string
			details?: Record<string, unknown>
			help?: string
		} = {},
	) {
		super(message, { cause: options.cause })
		this.name = 'CynapseError'
		this.exitCode = options.exitCode ?? EXIT_FAILURE
		if (options.code) this.code = options.code
		if (options.details) this.details = options.details
		if (options.help) this.help = options.help
	}
}

const FAILURE_HELP = 'fix what the message names, then run the command again'

/**
 * The next step for each error code, used when the error carries no help of its own
 * (axi principle 7). An error site that knows better passes `help` instead.
 */
const DEFAULT_HELP: Record<string, string> = {
	usage: 'run `cynapse --help` for the commands, then `cynapse <command> --help` for the flags one takes',
	failure: FAILURE_HELP,
	not_found:
		'check the reference: `cynapse channel list`, `cynapse entry list <channel>` and `cynapse participant list` show what exists',
	id_conflict: 'reuse the existing record as it is, or pass a different id or key',
	ambiguous_address: 'pass one of the candidates by id, or a more specific name',
	unknown_address: 'check the name with `cynapse participant list`, or register it with `cynapse participant register`',
	timeout: 'run `cynapse entry wait` again to keep waiting, or pass a longer --timeout',
	not_address: 'tag with cynapse.handled on an address channel only; on a work channel use another tag',
	not_owner: "act as the channel's owner with --as <owner>, or leave cynapse.handled to them",
	invalid_token: 'pass a token printed by `cynapse changes`, or call `cynapse changes` without --since to start over',
	foreign_token: 'call `cynapse changes` without --since to start over against this store',
	busy: 'another process holds the write lock on the database; retry the command',
	storage:
		'check the database file ($CYNAPSE_HOME/cynapse.db): free disk space if the disk is full, then run `sqlite3 <file> "PRAGMA integrity_check"`',
	schema_too_new: 'upgrade cynapse to the release that wrote this database: npm install -g cynapse@latest',
	port_in_use: 'pass --port <n> to pick another port',
	gui_not_installed: 'install it next to cynapse: npm install -g @cyberuni/cynapse-gui',
}

/** For a throw cynapse did not raise on purpose, which is a bug rather than a bad call. */
const BUG_HELP =
	'this looks like a bug in cynapse; report it with the command you ran at https://github.com/cyberuni/cynapse/issues'

/**
 * The suggested next step for any thrown value: the help a CynapseError carries, else its
 * code's default. Every error gets one, so a caller is never left without a way forward.
 */
export function helpFor(error: unknown): string {
	if (!(error instanceof CynapseError)) return BUG_HELP
	return error.help ?? DEFAULT_HELP[errorCodeFor(error)] ?? FAILURE_HELP
}

/**
 * The machine-readable reason for any thrown value. A coded CynapseError keeps its code;
 * anything else is `usage` or `failure`, matching its exit code, so a caller under
 * `--json` always gets a code to branch on.
 */
export function errorCodeFor(error: unknown): string {
	if (error instanceof CynapseError && error.code) return error.code
	return exitCodeFor(error) === EXIT_USAGE ? 'usage' : 'failure'
}

/** Exit code for any thrown value. Unknown throws are ordinary failures, never usage. */
export function exitCodeFor(error: unknown): number {
	return error instanceof CynapseError ? error.exitCode : EXIT_FAILURE
}

/**
 * What the CLI prints to stdout on failure, no stack. Agents read stdout, not stderr, so
 * an error goes where the data would have (axi principle 6): `error: <message>` and a
 * `help: <next step>` line in text, `{ "error": { code, message, help, ...details } }` under
 * `--json`, formatted like any other output so a caller branches on the code, not prose.
 * The cause is appended when it adds information.
 */
export function renderCliError(error: unknown, format: OutputFormat = 'text'): string {
	const message = describe(error)
	const help = helpFor(error)
	const details = error instanceof CynapseError ? error.details : undefined
	return format === 'json'
		? JSON.stringify({ error: { code: errorCodeFor(error), message, help, ...details } }, null, 2)
		: `error: ${message}\nhelp: ${help}`
}

function describe(error: unknown): string {
	if (error instanceof Error) {
		const cause = error.cause
		const detail = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : undefined
		return detail && detail !== error.message ? `${error.message}: ${detail}` : error.message
	}
	return String(error)
}
