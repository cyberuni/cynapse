import { describe, expect, it } from 'vitest'
import {
	CynapseError,
	EXIT_AMBIGUOUS_ADDRESS,
	EXIT_FAILURE,
	EXIT_TIMEOUT,
	EXIT_UNKNOWN_ADDRESS,
	EXIT_USAGE,
	errorCodeFor,
	exitCodeFor,
	helpFor,
	renderCliError,
} from './cli-error.js'

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
	/** The first line, the error itself, without the help line under it. */
	const firstLine = (text: string) => text.split('\n')[0]

	it('renders the message behind an error: label, so it reads as an error on stdout', () => {
		expect(firstLine(renderCliError(new Error('no address found')))).toBe('error: no address found')
	})

	it('appends a cause that adds information', () => {
		const error = new CynapseError('cannot read mailbox', { cause: new Error('ENOENT') })
		expect(firstLine(renderCliError(error))).toBe('error: cannot read mailbox: ENOENT')
	})

	it('does not repeat a cause identical to the message', () => {
		const error = new CynapseError('ENOENT', { cause: 'ENOENT' })
		expect(firstLine(renderCliError(error))).toBe('error: ENOENT')
	})

	it('stringifies a non-Error throw', () => {
		expect(firstLine(renderCliError({ toString: () => 'weird' }))).toBe('error: weird')
	})

	it('suggests the next step on a help: line under the error', () => {
		const error = new CynapseError('boom', { help: 'run it again' })
		expect(renderCliError(error)).toBe('error: boom\nhelp: run it again')
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
			error: { code: 'id_conflict', message: 'channel id x already exists', help: helpFor(error) },
		})
	})

	it('keeps the cause in the message, as text mode does', () => {
		const error = new CynapseError('cannot read mailbox', { cause: new Error('ENOENT') })
		expect(JSON.parse(renderCliError(error, 'json'))).toEqual({
			error: { code: 'failure', message: 'cannot read mailbox: ENOENT', help: helpFor(error) },
		})
	})

	it('is formatted like any other --json output', () => {
		const error = new CynapseError('boom', { help: 'retry' })
		expect(renderCliError(error, 'json')).toBe(
			JSON.stringify({ error: { code: 'failure', message: 'boom', help: 'retry' } }, null, 2),
		)
	})

	it('carries the next step as help, matching the text help: line', () => {
		const error = new CynapseError('boom', { help: 'run it again' })
		expect(JSON.parse(renderCliError(error, 'json')).error.help).toBe('run it again')
	})
})

describe('exit codes', () => {
	it('gives each address failure its own stable code, above the ones already taken', () => {
		expect([EXIT_FAILURE, EXIT_USAGE, EXIT_TIMEOUT, EXIT_AMBIGUOUS_ADDRESS, EXIT_UNKNOWN_ADDRESS]).toEqual([
			1, 2, 3, 4, 5,
		])
	})
})

describe('error details', () => {
	const candidates = [{ id: 'a', kind: 'agent', name: 'reviewer', registeredBy: 'u' }]
	const error = new CynapseError('"reviewer" names 1 participant', {
		code: 'ambiguous_address',
		details: { candidates },
	})

	it('carries details a caller can branch on', () => {
		expect(error.details).toEqual({ candidates })
	})

	it('renders the details beside code and message under --json', () => {
		expect(JSON.parse(renderCliError(error, 'json'))).toEqual({
			error: {
				code: 'ambiguous_address',
				message: '"reviewer" names 1 participant',
				help: helpFor(error),
				candidates,
			},
		})
	})
})

describe(helpFor.name, () => {
	it('returns the help a CynapseError carries', () => {
		expect(helpFor(new CynapseError('boom', { help: 'run it again' }))).toBe('run it again')
	})

	it.each([
		'usage',
		'failure',
		'not_found',
		'id_conflict',
		'ambiguous_address',
		'unknown_address',
		'timeout',
		'not_address',
		'not_owner',
		'invalid_token',
		'foreign_token',
		'schema_too_new',
		'port_in_use',
		'gui_not_installed',
	])('suggests a next step for a %s error that carries none', (code) => {
		expect(helpFor(new CynapseError('boom', { code }))).toMatch(/\S/)
	})

	it('points an uncoded usage error at --help', () => {
		expect(helpFor(new CynapseError('bad flag', { exitCode: EXIT_USAGE }))).toContain('--help')
	})

	it('asks for a bug report on a throw cynapse did not raise on purpose', () => {
		expect(helpFor(new Error('boom'))).toContain('github.com/cyberuni/cynapse/issues')
	})
})
