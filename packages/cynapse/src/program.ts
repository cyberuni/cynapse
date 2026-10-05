import { Command, type CommanderError } from 'commander'
import { CynapseError, EXIT_USAGE } from './cli-error.js'
import { registerChannel } from './commands/channel.js'
import { registerDev } from './commands/dev.js'
import { registerEntry } from './commands/entry.js'
import { registerGui } from './commands/gui.js'
import { registerRead, registerState, registerTag } from './commands/state.js'
import { setOutputFormat } from './output.js'
import { readPackageVersion } from './version.js'

/**
 * The CLI shell: global options, usage-error handling, and the command tree.
 *
 * Built as a function rather than a module-level singleton so tests can drive a fresh
 * program without touching `process.argv` or exiting the runner.
 */
export function createProgram(version: string = readPackageVersion()): Command {
	const program = new Command()

	program
		.name('cynapse')
		.description('A persisted communication network for agents — channels of immutable entries')
		.version(version, '-v, --version')
		.option('--json', 'emit JSON instead of human-readable text')
		.option('--db <path>', 'database file (default: $CYNAPSE_HOME/cynapse.db, home ~/.cynapse)')
		.option('--as <participant>', 'the participant acting (default: $CYNAPSE_PARTICIPANT)')
		.hook('preAction', (command) => {
			if (command.opts().json) setOutputFormat('json')
		})

	// Commander's default is to print and call process.exit itself. Turning both off
	// routes an unknown flag or subcommand through the same top-level catch as every
	// other failure, so exit codes are decided in one place.
	//
	// A command group run with no subcommand is a usage error too: Commander has already
	// printed the group's help to stderr and reports it as `commander.help` with a non-zero
	// exit code, unlike `--help`, which exits 0.
	program.exitOverride((error: CommanderError) => {
		if (error.code === 'commander.help' && error.exitCode !== 0) {
			throw new CynapseError('missing subcommand; see the usage above', { exitCode: EXIT_USAGE })
		}
		if (
			error.code === 'commander.version' ||
			error.code === 'commander.help' ||
			error.code === 'commander.helpDisplayed'
		) {
			throw error
		}
		// A usage error can fire before the preAction hook runs, so `--json` is read here
		// too; otherwise the error would render as text under `--json`.
		if (program.opts().json) setOutputFormat('json')
		throw new CynapseError(error.message.replace(/^error: /, ''), {
			exitCode: EXIT_USAGE,
			code: 'usage',
		})
	})
	// Commander's own error lines are silenced because the top-level catch renders them;
	// help still reaches stderr, so a bare command group shows its usage.
	program.configureOutput({ outputError: () => {} })

	registerChannel(program)
	registerEntry(program)
	registerRead(program)
	registerTag(program)
	registerState(program)
	registerGui(program)
	registerDev(program)

	return program
}
