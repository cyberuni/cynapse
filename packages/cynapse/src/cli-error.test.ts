import { describe, expect, it } from 'vitest'
import { CynapseError, EXIT_FAILURE, EXIT_USAGE, errorCodeFor, exitCodeFor, renderCliError } from './cli-error.js'

describe(exitCodeFor.name, () => {
	it('returns the code a CynapseError carries', () => {
		expect(exitCodeFor(new CynapseError('bad flag', { exitCode: EXIT_USAGE }))).toBe(EXIT_USAGE)
	})

	it('defaults a CynapseError without a code to a plain failure', () => {
		expect(exitCodeFor(new CynapseError('boom'))).toBe(EXIT_FAILURE)
	})

	it('treats an unknown throw as a plain failure, not a usage error', () => {
		expect(exitCodeFor(new Error('boom'))).toBe(EXIT_FAILURE)
		expect(exitCodeFor('boom')).toBe(EXIT_FAILURE)
	})
})

describe(CynapseError.name, () => {
	it('carries a machine-readable code when given one', () => {
		expect(new CynapseError('clash', { code: 'id_conflict' }).code).toBe('id_conflict')
		expect(new CynapseError('boom').code).toBeUndefined()
	})
})

describe(renderCliError.name, () => {
	it('renders the message behind an error: label, so it reads as an error on stdout', () => {
		expect(renderCliError(new Error('no address found'))).toBe('error: no address found')
	})

	it('appends a cause that adds information', () => {
		const error = new CynapseError('cannot read mailbox', { cause: new Error('ENOENT') })
		expect(renderCliError(error)).toBe('error: cannot read mailbox: ENOENT')
	})

	it('does not repeat a cause identical to the message', () => {
		const error = new CynapseError('ENOENT', { cause: 'ENOENT' })
		expect(renderCliError(error)).toBe('error: ENOENT')
	})

	it('stringifies a non-Error throw', () => {
		expect(renderCliError({ toString: () => 'weird' })).toBe('error: weird')
	})
})

describe(errorCodeFor.name, () => {
	it('returns the code a CynapseError carries', () => {
		expect(errorCodeFor(new CynapseError('clash', { code: 'id_conflict' }))).toBe('id_conflict')
	})

	it('names an uncoded usage error usage', () => {
		expect(errorCodeFor(new CynapseError('bad flag', { exitCode: EXIT_USAGE }))).toBe('usage')
	})

	it('names any other uncoded failure failure', () => {
		expect(errorCodeFor(new CynapseError('boom'))).toBe('failure')
		expect(errorCodeFor(new Error('boom'))).toBe('failure')
		expect(errorCodeFor('boom')).toBe('failure')
	})
})

describe(`${renderCliError.name} as json`, () => {
	it('renders one JSON object with the code and the message', () => {
		const error = new CynapseError('channel id x already exists', { code: 'id_conflict' })
		expect(JSON.parse(renderCliError(error, 'json'))).toEqual({
			error: { code: 'id_conflict', message: 'channel id x already exists' },
		})
	})

	it('keeps the cause in the message, as text mode does', () => {
		const error = new CynapseError('cannot read mailbox', { cause: new Error('ENOENT') })
		expect(JSON.parse(renderCliError(error, 'json'))).toEqual({
			error: { code: 'failure', message: 'cannot read mailbox: ENOENT' },
		})
	})

	it('is formatted like any other --json output', () => {
		const error = new CynapseError('boom')
		expect(renderCliError(error, 'json')).toBe(JSON.stringify({ error: { code: 'failure', message: 'boom' } }, null, 2))
	})
})
