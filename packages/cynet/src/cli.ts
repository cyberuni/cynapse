#!/usr/bin/env node
import { CommanderError } from 'commander'
import { EXIT_OK, exitCodeFor, renderCliError } from './cli-error.js'
import { createProgram } from './program.js'

// `--version` and `--help` reach here as throws because the program runs with
// exitOverride; they have already written their output and are a success, not a fault.
const CLEAN_EXITS = new Set(['commander.version', 'commander.help', 'commander.helpDisplayed'])

async function run(argv: string[]): Promise<number> {
	try {
		await createProgram().parseAsync(argv)
		return EXIT_OK
	} catch (error) {
		if (error instanceof CommanderError && CLEAN_EXITS.has(error.code)) return EXIT_OK
		console.error(renderCliError(error))
		return exitCodeFor(error)
	}
}

process.exitCode = await run(process.argv)
