#!/usr/bin/env node
import { CommanderError } from 'commander'
import { EXIT_OK, exitCodeFor, renderCliError } from './cli-error.js'
import { silenceSqliteWarning } from './sqlite-warning.js'

// The program is imported after the filter is in place, because loading it loads node:sqlite.
silenceSqliteWarning()
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
