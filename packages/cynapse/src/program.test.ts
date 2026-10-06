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

	it('switches to JSON before a bare command group under --json', async () => {
		await parse('--json', 'channel').catch(() => {})
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

	it.each(groupPaths(createProgram('1.2.3')))(
		'raises a usage error naming the subcommands for bare `%s`',
		async (path) => {
			const error = await parse(...path.split(' ').filter(Boolean)).catch((e: unknown) => e)
			expect(error).toBeInstanceOf(CynapseError)
			expect((error as CynapseError).exitCode).toBe(EXIT_USAGE)
			const subcommands = (error as CynapseError).details?.subcommands as string[]
			expect(subcommands.length).toBeGreaterThan(0)
			expect((error as CynapseError).help).toContain(`cynapse${path ? ` ${path}` : ''} <subcommand>`)
			for (const name of subcommands) expect((error as CynapseError).help).toContain(name)
		},
	)

	it('writes nothing to stderr for a bare command group, which agents do not read', async () => {
		const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
		const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
		await parse('channel').catch(() => {})
		expect(stderr).not.toHaveBeenCalled()
		expect(stdout).not.toHaveBeenCalled()
	})

	it('lists the subcommands of a group beside an unknown one', async () => {
		const error = (await parse('channel', 'anneal').catch((e: unknown) => e)) as CynapseError
		expect(error.details?.subcommands).toContain('list')
		expect(error.help).toContain('cynapse channel <subcommand>')
	})

	it("keeps Commander's suggestion on the message's one line", async () => {
		const error = (await parse('channel', 'list', '--typ').catch((e: unknown) => e)) as CynapseError
		expect(error.message).toBe("unknown option '--typ' (Did you mean --type?)")
	})

	it("lists the command's valid flags beside an unknown one", async () => {
		const error = (await parse('channel', 'list', '--nope').catch((e: unknown) => e)) as CynapseError
		expect(error.message).toContain("unknown option '--nope'")
		expect(error.details?.options).toEqual(expect.arrayContaining(['--kind <kind>', '--state <state>', '--json']))
		expect(error.help).toContain('`cynapse channel list` accepts')
		expect(error.help).toContain('--kind <kind>')
	})

	it('points any other usage error at the help of the command it came from', async () => {
		const error = (await parse('channel', 'show').catch((e: unknown) => e)) as CynapseError
		expect(error.exitCode).toBe(EXIT_USAGE)
		expect(error.help).toContain('cynapse channel show --help')
	})

	it("points a usage error a command raises at that command's help", async () => {
		const error = (await parse(
			'--as',
			'u',
			'channel',
			'create',
			'x',
			'--type',
			't',
			'--title',
			't',
			'--membership',
			'nope',
		).catch((e: unknown) => e)) as CynapseError
		expect(error.message).toBe('--membership must be open or fixed')
		expect(error.help).toContain('cynapse channel create --help')
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
