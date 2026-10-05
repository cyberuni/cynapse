import { type Command, CommanderError } from 'commander'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CynapseError, EXIT_USAGE } from './cli-error.js'
import { getOutputFormat, setOutputFormat } from './output.js'
import { createProgram } from './program.js'

afterEach(() => {
	setOutputFormat('text')
	vi.restoreAllMocks()
})

/** `parse` with an argv shaped the way Commander expects it from a real invocation. */
function parse(...args: string[]) {
	return createProgram('1.2.3').parseAsync(['node', 'cynapse', ...args])
}

describe(createProgram.name, () => {
	it('reports the version it was given', async () => {
		const log = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
		await expect(parse('--version')).rejects.toThrow(CommanderError)
		expect(log).toHaveBeenCalledWith('1.2.3\n')
	})

	it('raises an unknown flag as a usage error, not a crash', async () => {
		const error = await parse('--nope').catch((e: unknown) => e)
		expect(error).toBeInstanceOf(CynapseError)
		expect((error as CynapseError).exitCode).toBe(EXIT_USAGE)
	})

	it('codes a usage error usage', async () => {
		const error = await parse('--nope').catch((e: unknown) => e)
		expect((error as CynapseError).code).toBe('usage')
	})

	it("drops Commander's own error: label, which the renderer adds", async () => {
		const error = await parse('--nope').catch((e: unknown) => e)
		expect((error as CynapseError).message).toBe("unknown option '--nope'")
	})

	it('switches to JSON before a usage error under --json, so the error renders as JSON', async () => {
		await parse('--json', '--nope').catch(() => {})
		expect(getOutputFormat()).toBe('json')
	})

	it('switches to JSON before an unknown subcommand under --json', async () => {
		await parse('--json', 'anneal').catch(() => {})
		expect(getOutputFormat()).toBe('json')
	})

	it('switches to JSON before an unknown subcommand flag under --json', async () => {
		await parse('--json', 'entry', 'list', 'x', '--nope').catch(() => {})
		expect(getOutputFormat()).toBe('json')
	})

	it('raises an unknown subcommand as a usage error', async () => {
		const error = await parse('anneal').catch((e: unknown) => e)
		expect(error).toBeInstanceOf(CynapseError)
		expect((error as CynapseError).exitCode).toBe(EXIT_USAGE)
	})

	it.each(groupPaths(createProgram('1.2.3')))('prints help and raises a usage error for bare `%s`', async (path) => {
		const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
		const error = await parse(...path.split(' ').filter(Boolean)).catch((e: unknown) => e)
		expect(error).toBeInstanceOf(CynapseError)
		expect((error as CynapseError).exitCode).toBe(EXIT_USAGE)
		const written = stderr.mock.calls.map(([chunk]) => String(chunk)).join('')
		expect(written).toContain(`Usage: cynapse${path ? ` ${path}` : ''}`)
	})

	it('leaves the output format alone when --json is absent', () => {
		createProgram('1.2.3')
		expect(getOutputFormat()).toBe('text')
	})
})

/** Every command with subcommands, as its path below `cynapse` (the root is ''). */
function groupPaths(command: Command, prefix: string[] = []): string[] {
	if (command.commands.length === 0) return []
	return [prefix.join(' '), ...command.commands.flatMap((sub) => groupPaths(sub, [...prefix, sub.name()]))]
}
