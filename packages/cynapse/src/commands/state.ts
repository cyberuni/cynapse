import type { Command } from 'commander'
import { CynapseError, EXIT_USAGE } from '../cli-error.js'
import { output, printEmpty } from '../output.js'
import type { StateStatus } from '../store/types.js'
import { actor, collect, parseInteger, withStore } from './context.js'
import { stateLine } from './render.js'

export function registerRead(program: Command): void {
	program
		.command('read <channel>')
		.description('advance your read cursor (to the latest entry unless --to is given)')
		.option('--to <seq>', 'mark read up to this seq')
		.action(async (ref: string, opts, command: Command) => {
			const participant = actor(command)
			await withStore(command, (store) => {
				const seq = opts.to ? parseInteger(opts.to, '--to') : undefined
				const member = store.markRead(ref, participant, seq)
				output(member, () => `${participant} has read ${ref} up to seq ${member.cursor}`)
			})
		})

	program
		.command('unread')
		.description(
			'channels with unread entries: those you are a member of, and replies in threads you wrote in elsewhere',
		)
		.action(async (_opts, command: Command) => {
			const participant = actor(command)
			await withStore(command, (store) => {
				const counts = store.unread(participant)
				if (!counts.length) return printEmpty('unread channels')
				output({ count: counts.length, items: counts }, () =>
					counts.map((c) => `${c.handle}  ${c.count} unread`).join('\n'),
				)
			})
		})
}

export function registerChanges(program: Command): void {
	program
		.command('changes')
		.description('channels that changed since a token; poll with the token it prints')
		.option('--since <token>', 'the token from the last call; every channel when absent')
		.action(async (opts, command: Command) => {
			await withStore(command, (store) => {
				const { token, channels } = store.changes(opts.since)
				if (!channels.length) return printEmpty('changed channels', { token })
				output({ token, count: channels.length, items: channels }, () =>
					[...channels.map((c) => `${c.handle}  seq ${c.lastSeq}`), `token: ${token}`].join('\n'),
				)
			})
		})
}

export function registerTag(program: Command): void {
	program
		.command('tag <entry> [tags...]')
		.description('add tags to an entry (written as a cynapse.label entry)')
		.option('--remove <tag>', 'remove this tag (repeatable)', collect)
		.action(async (ref: string, tags: string[], opts, command: Command) => {
			const author = actor(command)
			const remove: string[] = opts.remove ?? []
			if (!tags.length && !remove.length) {
				throw new CynapseError('give tags to add or --remove <tag>', { exitCode: EXIT_USAGE })
			}
			await withStore(command, (store) => {
				if (tags.length) store.addTags(ref, tags, author)
				if (remove.length) store.removeTags(ref, remove, author)
				const target = store.entry(ref)
				output(target, () => `${ref} tags: ${target?.tags.join(', ') || 'none'}`)
			})
		})
}

const STATUSES: StateStatus[] = ['open', 'resolved']

function parseStatus(value: string): StateStatus {
	if (!STATUSES.includes(value as StateStatus)) {
		throw new CynapseError(`--status must be ${STATUSES.join(' or ')}`, { exitCode: EXIT_USAGE })
	}
	return value as StateStatus
}

export function registerState(program: Command): void {
	const state = program.command('state').description('state records: lifecycle, pending answers, needs-input')

	state
		.command('list')
		.description('list state records')
		.option('--channel <channel>', 'only this channel')
		.option('--kind <kind>', 'only this kind, such as needs-input')
		.option('--status <status>', 'open or resolved')
		.option('--subject <participant>', 'only records waiting on this participant')
		.action(async (opts, command: Command) => {
			const status = opts.status === undefined ? undefined : parseStatus(opts.status)
			await withStore(command, (store) => {
				const records = store.states({
					channel: opts.channel,
					kind: opts.kind,
					status,
					subject: opts.subject,
				})
				if (!records.length) return printEmpty('state records')
				const handles = new Map(store.listChannels().map((s) => [s.id, s.handle]))
				output({ count: records.length, items: records }, () =>
					records.map((r) => stateLine(r, handles.get(r.channelId))).join('\n'),
				)
			})
		})

	state
		.command('set <channel> <key>')
		.description('set a state record; the transition is also written as an entry')
		.requiredOption('--kind <kind>', 'such as needs-input, pending-answers, lease')
		.requiredOption('--status <status>', 'open or resolved')
		.option('--subject <participant>', 'the participant it waits on or is held by')
		.option('--entry <entry>', 'the entry it is about')
		.option('--value <json>', 'any JSON value')
		.action(async (ref: string, key: string, opts, command: Command) => {
			const author = actor(command)
			const status = parseStatus(opts.status)
			let value: unknown
			if (opts.value !== undefined) {
				try {
					value = JSON.parse(opts.value)
				} catch (error) {
					throw new CynapseError('--value is not valid JSON', { exitCode: EXIT_USAGE, cause: error })
				}
			}
			await withStore(command, (store) => {
				const record = store.setState(
					ref,
					{ key, kind: opts.kind, status, subject: opts.subject, entryId: opts.entry, value },
					author,
				)
				output(record, () => stateLine(record, ref))
			})
		})

	state
		.command('lifecycle <channel> <state>')
		.description('move a channel to a lifecycle state, such as reconciled')
		.action(async (ref: string, lifecycle: string, _opts, command: Command) => {
			const author = actor(command)
			await withStore(command, (store) => {
				const logged = store.setLifecycle(ref, lifecycle, author)
				output(logged, () => `${logged.channel} is now ${lifecycle}`)
			})
		})
}
