/**
 * Exit codes the CLI is allowed to return. Agents branch on these, so the set stays
 * small and stable: anything new needs a reason a caller can act on differently.
 */
export const EXIT_OK = 0
export const EXIT_FAILURE = 1
export const EXIT_USAGE = 2

/** A failure the CLI raised deliberately, with an exit code a caller can branch on. */
export class CynetError extends Error {
	readonly exitCode: number

	constructor(message: string, options: { exitCode?: number; cause?: unknown } = {}) {
		super(message, { cause: options.cause })
		this.name = 'CynetError'
		this.exitCode = options.exitCode ?? EXIT_FAILURE
	}
}

/** Exit code for any thrown value. Unknown throws are ordinary failures, never usage. */
export function exitCodeFor(error: unknown): number {
	return error instanceof CynetError ? error.exitCode : EXIT_FAILURE
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
