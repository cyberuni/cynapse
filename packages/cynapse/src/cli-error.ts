/**
 * Exit codes the CLI is allowed to return. Agents branch on these, so the set stays
 * small and stable: anything new needs a reason a caller can act on differently.
 */
export const EXIT_OK = 0
export const EXIT_FAILURE = 1
export const EXIT_USAGE = 2

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

/** Exit code for any thrown value. Unknown throws are ordinary failures, never usage. */
export function exitCodeFor(error: unknown): number {
	return error instanceof CynapseError ? error.exitCode : EXIT_FAILURE
}

/**
 * One line on stderr, no stack. Agents read this text, so it names what failed rather
 * than dumping a trace; the cause is appended when it adds information.
 */
export function renderCliError(error: unknown): string {
	if (error instanceof Error) {
		const cause = error.cause
		const detail = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : undefined
		return detail && detail !== error.message ? `${error.message}: ${detail}` : error.message
	}
	return String(error)
}
