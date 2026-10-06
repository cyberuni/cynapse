import type { Command } from 'commander'
import { CynapseError, EXIT_USAGE } from '../cli-error.js'
import { output, printEmpty } from '../output.js'
import type { ParticipantKind, ParticipantStatus } from '../store/types.js'
import { actor, collect, withStore } from './context.js'
import { participantLine } from './render.js'

const KINDS: readonly ParticipantKind[] = ['agent', 'human', 'service']
const STATUSES: readonly ParticipantStatus[] = ['live', 'retired']

export function registerParticipant(program: Command): void {
	const participant = program.command('participant').description('register, retire, rename and resolve participants')

	participant
		.command('register <key>')
		.description('register a participant under a key namespaced by your unit; registering again is a no-op')
		.requiredOption('--kind <kind>', 'agent, human or service')
		.requiredOption('--name <name>', 'the name it resolves by; its address handle is made from it')
		.option('--self', 'a unit registering itself, as a service; otherwise the unit is --as')
		.action(async (key: string, opts, command: Command) => {
			const kind = parseKind(opts.kind)
			const registeredBy = opts.self ? undefined : actor(command)
			await withStore(command, (store) => {
				const registered = store.registerParticipant({ key, kind, name: opts.name, registeredBy })
				output(
					registered,
					() => `registered ${participantLine(registered.participant)}  address ${registered.channel.handle}`,
				)
			})
		})

	participant
		.command('retire <participant>')
		.description('mark a participant retired; it stops resolving and its address channel stays readable')
		.action(async (id: string, _opts, command: Command) => {
			const author = actor(command)
			await withStore(command, (store) => {
				const retired = store.retireParticipant(id, author)
				output(retired, () => `retired ${participantLine(retired)}`)
			})
		})

	participant
		.command('purge <participant>')
		.description("erase every entry in a retired participant's address channel outside cynapse.*, leaving tombstones")
		.action(async (id: string, _opts, command: Command) => {
			const author = actor(command)
			await withStore(command, (store) => {
				const logged = store.purgeParticipant(id, author)
				const count = (logged.data?.count as number | undefined) ?? 0
				output(
					logged,
					() =>
						`purged ${count} ${count === 1 ? 'entry' : 'entries'} from ${logged.channel}  logged ${logged.channel}#${logged.seq}`,
				)
			})
		})

	participant
		.command('rename <participant> <name>')
		.description('rename a participant and its address handle; the old handle stays as an alias')
		.action(async (id: string, name: string, _opts, command: Command) => {
			const author = actor(command)
			await withStore(command, (store) => {
				const renamed = store.renameParticipant(id, name, author)
				output(renamed, () => `renamed ${participantLine(renamed)}`)
			})
		})

	participant
		.command('resolve <name>')
		.description(
			'the one live participant with this exact id, name or address handle; exits 4 when ambiguous, 5 when unknown',
		)
		.option('--kind <kind>', 'only this kind (repeatable)', collect)
		.action(async (name: string, opts, command: Command) => {
			const kinds = ((opts.kind ?? []) as string[]).map(parseKind)
			await withStore(command, (store) => {
				const resolved = store.resolveAddress(name, { kinds })
				output(
					resolved,
					() =>
						`${participantLine(resolved.participant)}${resolved.channel ? `  address ${resolved.channel.handle}` : ''}`,
				)
			})
		})

	participant
		.command('list')
		.description('list participants, to reconcile what a unit registered against what it runs')
		.option('--status <status>', 'live or retired')
		.option('--registered-by <participant>', 'only participants this unit registered')
		.action(async (opts, command: Command) => {
			if (opts.status && !STATUSES.includes(opts.status)) {
				throw new CynapseError('--status must be live or retired', { exitCode: EXIT_USAGE })
			}
			await withStore(command, (store) => {
				const items = store.participants({ status: opts.status, registeredBy: opts.registeredBy })
				if (!items.length) return printEmpty('participants')
				output({ count: items.length, items }, () => items.map(participantLine).join('\n'))
			})
		})
}

function parseKind(value: string): ParticipantKind {
	if (!KINDS.includes(value as ParticipantKind)) {
		throw new CynapseError('--kind must be agent, human or service', { exitCode: EXIT_USAGE })
	}
	return value as ParticipantKind
}
