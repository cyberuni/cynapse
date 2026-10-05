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

/** A failure the CLI raised deliberately, with an exit code a caller can branch on. */
export class CynapseError extends Error {
	readonly exitCode: number
	/** A stable, machine-readable reason, such as `id_conflict`, for callers that branch on more than the exit code. */
	readonly code?: string

	constructor(message: string, options: { exitCode?: number; cause?: unknown; code?: string } = {}) {
		super(message, { cause: options.cause })
		this.name = 'CynapseError'
		this.exitCode = options.exitCode ?? EXIT_FAILURE
		if (options.code) this.code = options.code
	}
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
 * an error goes where the data would have (axi principle 6): `error: <message>` in text,
 * `{ "error": { code, message } }` under `--json`, formatted like any other output so a
 * caller branches on the code, not prose. The cause is appended when it adds information.
 */
export function renderCliError(error: unknown, format: OutputFormat = 'text'): string {
	const message = describe(error)
	return format === 'json'
		? JSON.stringify({ error: { code: errorCodeFor(error), message } }, null, 2)
		: `error: ${message}`
}

function describe(error: unknown): string {
	if (error instanceof Error) {
		const cause = error.cause
		const detail = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : undefined
		return detail && detail !== error.message ? `${error.message}: ${detail}` : error.message
	}
	return String(error)
}
