import { Command, type CommanderError } from 'commander'
import { CynapseError, EXIT_USAGE } from './cli-error.js'
import { registerChannel } from './commands/channel.js'
import { registerDev } from './commands/dev.js'
import { registerEntry } from './commands/entry.js'
import { registerGui } from './commands/gui.js'
import { registerParticipant } from './commands/participant.js'
import { registerChanges, registerRead, registerState, registerTag } from './commands/state.js'
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

	// Commander writes help to stderr when a command group runs bare, and agents do not
	// read stderr. Both writers are silenced: the top-level catch renders every usage error
	// on stdout, with the group's subcommands inlined (see `usageError`).
	program.configureOutput({ outputError: () => {}, writeErr: () => {} })

	registerChannel(program)
	registerEntry(program)
	registerParticipant(program)
	registerRead(program)
	registerChanges(program)
	registerTag(program)
	registerState(program)
	registerGui(program)
	registerDev(program)

	// Commander's default is to print and call process.exit itself. Overriding it on every
	// command routes an unknown flag or subcommand through the same top-level catch as every
	// other failure, so exit codes are decided in one place, and the error knows which
	// command raised it, so its help can name that command's flags or subcommands.
	for (const command of commandsOf(program)) {
		command.exitOverride((error: CommanderError) => {
			// A usage error can fire before the preAction hook runs, so `--json` is read here
			// too; otherwise the error would render as text under `--json`.
			if (program.opts().json) setOutputFormat('json')
			// `--help` and `--version` have written their output and exit 0. A command group
			// run with no subcommand is reported as `commander.help` too, but non-zero.
			if (CLEAN_EXITS.has(error.code) && !(error.code === 'commander.help' && error.exitCode !== 0)) throw error
			throw usageError(error, command)
		})
	}

	// A usage error an action raises, such as a bad flag value, gets the help of the
	// command that ran it unless it names its own next step.
	let acting: Command | undefined
	program.hook('preAction', (_program, actionCommand) => {
		acting = actionCommand
	})
	const parseAsync = program.parseAsync.bind(program)
	program.parseAsync = async (...args) => {
		try {
			return await parseAsync(...args)
		} catch (error) {
			throw acting ? withCommandHelp(error, acting) : error
		}
	}

	return program
}

const CLEAN_EXITS = new Set(['commander.version', 'commander.help', 'commander.helpDisplayed'])

/** A Commander usage error as a CynapseError whose help points at what the command accepts. */
function usageError(error: CommanderError, command: Command): CynapseError {
	const path = commandPath(command)
	const options = { exitCode: EXIT_USAGE, code: 'usage' }
	if (error.code === 'commander.help' || error.code === 'commander.unknownCommand') {
		const subcommands = subcommandsOf(command)
		return new CynapseError(error.code === 'commander.help' ? 'missing subcommand' : stripLabel(error.message), {
			...options,
			details: { subcommands },
			help: `run \`${path} <subcommand>\` with one of ${subcommands.join(', ')}; \`${path} <subcommand> --help\` shows its flags`,
		})
	}
	if (error.code === 'commander.unknownOption') {
		const flags = flagsOf(command)
		return new CynapseError(stripLabel(error.message), {
			...options,
			details: { options: flags },
			help: `\`${path}\` accepts ${flags.join(', ')}; run \`${path} --help\` for what each does`,
		})
	}
	return new CynapseError(stripLabel(error.message), { ...options, help: helpOf(path) })
}

/** The same usage error with the acting command's help, if it named no next step itself. */
function withCommandHelp(error: unknown, command: Command): unknown {
	if (!(error instanceof CynapseError) || error.exitCode !== EXIT_USAGE || error.help) return error
	return new CynapseError(error.message, {
		exitCode: error.exitCode,
		cause: error.cause,
		code: error.code,
		details: error.details,
		help: helpOf(commandPath(command)),
	})
}

function helpOf(path: string): string {
	return `run \`${path} --help\` for the arguments and flags it takes`
}

/** Commander's message without its `error: ` label, which the renderer adds, on one line. */
function stripLabel(message: string): string {
	return message.replace(/^error: /, '').replace(/\s*\n\s*/g, ' ')
}

/** The command and every command below it. */
function commandsOf(command: Command): Command[] {
	return [command, ...command.commands.flatMap(commandsOf)]
}

/** The command as typed, such as `cynapse channel list`. */
function commandPath(command: Command): string {
	const names: string[] = []
	for (let at: Command | null = command; at; at = at.parent) names.unshift(at.name())
	return names.join(' ')
}

/** The subcommands `--help` lists, without Commander's implicit `help`. */
function subcommandsOf(command: Command): string[] {
	return command
		.createHelp()
		.visibleCommands(command)
		.map((sub) => sub.name())
		.filter((name) => name !== 'help')
}

/** Every flag the command accepts, its own and the global ones its ancestors define. */
function flagsOf(command: Command): string[] {
	const flags = new Set<string>()
	for (let at: Command | null = command; at; at = at.parent) {
		for (const option of at.createHelp().visibleOptions(at)) flags.add(option.flags)
	}
	return [...flags]
}
