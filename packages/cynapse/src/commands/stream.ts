import type { Command } from 'commander'
import { CynapseError, EXIT_USAGE } from '../cli-error.js'
import { output, printEmpty } from '../output.js'
import { actor, collect, optionalActor, withStore } from './context.js'
import { briefing, streamLine, treeLines } from './render.js'

export function registerStream(program: Command): void {
	const stream = program.command('stream').description('create and inspect streams')

	stream
		.command('create <handle>')
		.description('create a stream (idempotent for --anchor and --key)')
		.requiredOption('--type <type>', 'namespaced stream type, such as sdd.mission')
		.requiredOption('--title <title>', 'title')
		.option('--purpose <text>', 'what the stream is for')
		.option('--anchor <entry>', 'branch from this entry in a parent stream (id or handle#seq)')
		.option('--key <key>', 'natural key; the stream id is derived from it')
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
				const created = store.createStream({
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
				const result = store.getStream(created.id)
				output(result, () => `created ${streamLine(result ?? created)}`)
			})
		})

	stream
		.command('show <stream>')
		.description("the agent's briefing: purpose, members, context, state, pinned, conventions, stats")
		.action(async (ref: string, _opts, command: Command) => {
			await withStore(command, (store) => {
				const brief = store.brief(ref, { as: optionalActor(command) })
				output(brief, () => briefing(brief))
			})
		})

	stream
		.command('list')
		.description('list streams')
		.option('--type <type>', 'only this stream type')
		.option('--parent <stream>', 'only streams anchored in this stream')
		.option('--state <state>', 'only this lifecycle state')
		.action(async (opts, command: Command) => {
			await withStore(command, (store) => {
				const streams = store.listStreams({ type: opts.type, parent: opts.parent, state: opts.state })
				if (!streams.length) return printEmpty('streams')
				output({ count: streams.length, items: streams }, () => streams.map(streamLine).join('\n'))
			})
		})

	stream
		.command('tree [stream]')
		.description('streams and the child streams anchored in them')
		.action(async (ref: string | undefined, _opts, command: Command) => {
			await withStore(command, (store) => {
				const trees = store.tree(ref)
				if (!trees.length) return printEmpty('streams')
				output(trees, () => treeLines(trees).join('\n'))
			})
		})

	stream
		.command('rename <stream> <handle>')
		.description('rename a stream; the old handle stays as an alias')
		.action(async (ref: string, handle: string, _opts, command: Command) => {
			const author = actor(command)
			await withStore(command, (store) => {
				const renamed = store.renameStream(ref, handle, author)
				output(renamed, () => `renamed to ${renamed.handle} (aliases: ${renamed.aliases.join(', ')})`)
			})
		})

	stream
		.command('pin <entry>')
		.description('pin an entry in its stream')
		.action(async (ref: string, _opts, command: Command) => {
			const author = actor(command)
			await withStore(command, (store) => {
				const logged = store.pin(ref, author)
				output(logged, () => `pinned ${logged.refs[0]}`)
			})
		})

	stream
		.command('view <stream> <name>')
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
				output(logged, () => `view ${name} saved on ${logged.stream}`)
			})
		})
}
