import { describe, expect, it } from 'vitest'
import { CynetError, EXIT_FAILURE, EXIT_USAGE, exitCodeFor, renderCliError } from './cli-error.js'

describe(exitCodeFor.name, () => {
	it('returns the code a CynetError carries', () => {
		expect(exitCodeFor(new CynetError('bad flag', { exitCode: EXIT_USAGE }))).toBe(EXIT_USAGE)
	})

	it('defaults a CynetError without a code to a plain failure', () => {
		expect(exitCodeFor(new CynetError('boom'))).toBe(EXIT_FAILURE)
	})

	it('treats an unknown throw as a plain failure, not a usage error', () => {
		expect(exitCodeFor(new Error('boom'))).toBe(EXIT_FAILURE)
		expect(exitCodeFor('boom')).toBe(EXIT_FAILURE)
	})
})

describe(renderCliError.name, () => {
	it('renders the message alone', () => {
		expect(renderCliError(new Error('no address found'))).toBe('no address found')
	})

	it('appends a cause that adds information', () => {
		const error = new CynetError('cannot read mailbox', { cause: new Error('ENOENT') })
		expect(renderCliError(error)).toBe('cannot read mailbox: ENOENT')
	})

	it('does not repeat a cause identical to the message', () => {
		const error = new CynetError('ENOENT', { cause: 'ENOENT' })
		expect(renderCliError(error)).toBe('ENOENT')
	})

	it('stringifies a non-Error throw', () => {
		expect(renderCliError({ toString: () => 'weird' })).toBe('weird')
	})
})
