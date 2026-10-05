#!/usr/bin/env node
import { CommanderError } from 'commander'
import { EXIT_OK, exitCodeFor, renderCliError } from './cli-error.js'

// node:sqlite prints an ExperimentalWarning when first loaded. Agents read stderr, so
// that line would look like a failure; drop that one warning and keep every other. The
// program is imported after the filter is in place, because loading it loads node:sqlite.
const emitWarning = process.emitWarning.bind(process)
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
	const text = typeof warning === 'string' ? warning : warning.message
	if (text.includes('SQLite is an experimental feature')) return
	return (emitWarning as (...args: unknown[]) => void)(warning, ...rest)
}) as typeof process.emitWarning
const { createProgram } = await import('./program.js')
const { getOutputFormat } = await import('./output.js')

// `--version` and `--help` reach here as throws because the program runs with
// exitOverride; they have already written their output and are a success, not a fault.
const CLEAN_EXITS = new Set(['commander.version', 'commander.help', 'commander.helpDisplayed'])

async function run(argv: string[]): Promise<number> {
	try {
		await createProgram().parseAsync(argv)
		return EXIT_OK
	} catch (error) {
		if (error instanceof CommanderError && CLEAN_EXITS.has(error.code)) return EXIT_OK
		console.log(renderCliError(error, getOutputFormat()))
		return exitCodeFor(error)
	}
}

process.exitCode = await run(process.argv)
