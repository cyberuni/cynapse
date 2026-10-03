import type { Command } from 'commander'
import { CynapseError, EXIT_USAGE } from '../cli-error.js'
import { output, printEmpty } from '../output.js'
import { actor, collect, optionalActor, withStore } from './context.js'
import { briefing, channelLine, treeLines } from './render.js'

export function registerChannel(program: Command): void {
	const channel = program.command('channel').description('create and inspect channels')

	channel
		.command('create <handle>')
		.description('create a channel (idempotent for --anchor and --key)')
		.requiredOption('--type <type>', 'namespaced channel type, such as sdd.mission')
		.requiredOption('--title <title>', 'title')
		.option('--purpose <text>', 'what the channel is for')
		.option('--anchor <entry>', 'branch from this entry in a parent channel (id or handle#seq)')
		.option('--key <key>', 'natural key; the channel id is derived from it')
		.option('--member <participant:role>', 'add a member (repeatable)', collect)
		.option('--context <ref>', 'add a context ref, such as gh:org/repo#12 (repeatable)', collect)
		.option('--convention <name>', 'a convention that applies (repeatable)', collect)
		.option('--membership <kind>', 'open or fixed')
		.option('--wake', 'wake members when an entry lands')
		.action(async (handle: string, opts, command: Command) => {
			const author = actor(command)
			if (opts.membership && opts.membership !== 'open' && opts.membership !== 'fixed') {
				throw new CynapseError('--membership must be open or fixed', { exitCode: EXIT_USAGE })
			}
			await withStore(command, (store) => {
				const created = store.createChannel({
					handle,
					type: opts.type,
					title: opts.title,
					author,
					purpose: opts.purpose,
					anchor: opts.anchor,
					key: opts.key,
					conventions: opts.convention,
					traits: {
						...(opts.membership ? { membership: opts.membership } : {}),
						...(opts.wake ? { wake: true } : {}),
					},
				})
				for (const member of (opts.member ?? []) as string[]) {
					const [participant, role = 'member'] = member.split(':')
					store.addMember(created.id, participant as string, role, author)
				}
				for (const ref of (opts.context ?? []) as string[]) store.addContext(created.id, ref, author)
				const result = store.getChannel(created.id)
				output(result, () => `created ${channelLine(result ?? created)}`)
			})
		})

	channel
		.command('show <channel>')
		.description("the agent's briefing: purpose, members, context, state, pinned, conventions, stats")
		.action(async (ref: string, _opts, command: Command) => {
			await withStore(command, (store) => {
				const brief = store.brief(ref, { as: optionalActor(command) })
				output(brief, () => briefing(brief))
			})
		})

	channel
		.command('list')
		.description('list channels')
		.option('--type <type>', 'only this channel type')
		.option('--parent <channel>', 'only channels anchored in this channel')
		.option('--state <state>', 'only this lifecycle state')
		.action(async (opts, command: Command) => {
			await withStore(command, (store) => {
				const channels = store.listChannels({ type: opts.type, parent: opts.parent, state: opts.state })
				if (!channels.length) return printEmpty('channels')
				output({ count: channels.length, items: channels }, () => channels.map(channelLine).join('\n'))
			})
		})

	channel
		.command('tree [channel]')
		.description('channels and the child channels anchored in them')
		.action(async (ref: string | undefined, _opts, command: Command) => {
			await withStore(command, (store) => {
				const trees = store.tree(ref)
				if (!trees.length) return printEmpty('channels')
				output(trees, () => treeLines(trees).join('\n'))
			})
		})

	channel
		.command('rename <channel> <handle>')
		.description('rename a channel; the old handle stays as an alias')
		.action(async (ref: string, handle: string, _opts, command: Command) => {
			const author = actor(command)
			await withStore(command, (store) => {
				const renamed = store.renameChannel(ref, handle, author)
				output(renamed, () => `renamed to ${renamed.handle} (aliases: ${renamed.aliases.join(', ')})`)
			})
		})

	channel
		.command('pin <entry>')
		.description('pin an entry in its channel')
		.action(async (ref: string, _opts, command: Command) => {
			const author = actor(command)
			await withStore(command, (store) => {
				const logged = store.pin(ref, author)
				output(logged, () => `pinned ${logged.refs[0]}`)
			})
		})

	channel
		.command('view <channel> <name>')
		.description('save a filter as a named view, such as distilled')
		.option('--type <type>', 'include this type or prefix.* (repeatable)', collect)
		.option('--exclude-type <type>', 'exclude this type or prefix.* (repeatable)', collect)
		.option('--tag <tag>', 'include entries with this tag (repeatable)', collect)
		.option('--author <participant>', 'include entries by this author (repeatable)', collect)
		.action(async (ref: string, name: string, opts, command: Command) => {
			const author = actor(command)
			await withStore(command, (store) => {
				const filter = {
					...(opts.type ? { types: opts.type } : {}),
					...(opts.excludeType ? { excludeTypes: opts.excludeType } : {}),
					...(opts.tag ? { tags: opts.tag } : {}),
					...(opts.author ? { authors: opts.author } : {}),
				}
				const logged = store.defineView(ref, name, filter, author)
				output(logged, () => `view ${name} saved on ${logged.channel}`)
			})
		})
}
