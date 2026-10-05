import type { Command } from 'commander'
import type { SubjectId } from '../channel-key.js'
import { CynapseError, EXIT_USAGE } from '../cli-error.js'
import { output, printEmpty } from '../output.js'
import type { ChannelKind } from '../store/types.js'
import { actor, collect, optionalActor, withStore } from './context.js'
import { briefing, channelLine, subjectText, treeLines } from './render.js'

export function registerChannel(program: Command): void {
	const channel = program.command('channel').description('create and inspect channels')

	channel
		.command('create <handle>')
		.description('create a channel (idempotent for --store/--native-id, --anchor and --key)')
		.requiredOption('--type <type>', 'namespaced channel type, such as sdd.mission')
		.requiredOption('--title <title>', 'title')
		.option('--purpose <text>', 'what the channel is for')
		.option('--anchor <entry>', 'branch from this entry in a parent channel (id or handle#seq)')
		.option('--key <key>', 'natural key; the channel id is derived from it')
		.option('--store <store>', "the subject's store, such as gh; needs --native-id")
		.option(
			'--native-id <id>',
			"the subject's id in its store, such as a GitHub node_id; the channel id is derived from it",
		)
		.option('--kind <kind>', 'address or work (default work); an address without --store gets a minted key')
		.option('--owner <participant>', 'the owner of an address channel')
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
			const kind = parseKind(opts.kind)
			const subject = opts.store || opts.nativeId ? parseSubject(opts) : undefined
			if (kind === 'address' && !opts.owner) {
				throw new CynapseError('--kind address needs --owner', { exitCode: EXIT_USAGE })
			}
			await withStore(command, (store) => {
				const input = {
					handle,
					type: opts.type,
					title: opts.title,
					author,
					purpose: opts.purpose,
					conventions: opts.convention,
					traits: {
						...(opts.membership ? { membership: opts.membership } : {}),
						...(opts.wake ? { wake: true } : {}),
					},
				}
				const created =
					kind === 'address' && !subject && !opts.anchor && !opts.key
						? store.registerAddress({ ...input, owner: opts.owner })
						: store.createChannel({ ...input, anchor: opts.anchor, key: opts.key, subject, kind, owner: opts.owner })
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
		.option('--kind <kind>', 'only address or only work channels')
		.option('--type <type>', 'only this channel type')
		.option('--parent <channel>', 'only channels anchored in this channel')
		.option('--state <state>', 'only this lifecycle state')
		.action(async (opts, command: Command) => {
			await withStore(command, (store) => {
				const channels = store.listChannels({
					kind: parseKind(opts.kind),
					type: opts.type,
					parent: opts.parent,
					state: opts.state,
				})
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
		.command('resolve')
		.description("find the channel keyed by a subject's store and native id, including an alias key")
		.requiredOption('--store <store>', "the subject's store, such as gh")
		.requiredOption('--native-id <id>', "the subject's id in its store")
		.action(async (opts, command: Command) => {
			const subject = parseSubject(opts)
			await withStore(command, (store) => {
				const found = store.getChannelBySubject(subject)
				if (!found) {
					throw new CynapseError(`no channel keyed by ${subject.store} ${subject.nativeId}`, { code: 'not_found' })
				}
				output(found, () => channelLine(found))
			})
		})

	channel
		.command('add-key <channel>')
		.description('add an alias key, as when the subject moved and its store gave it a new native id')
		.requiredOption('--store <store>', "the subject's store, such as gh")
		.requiredOption('--native-id <id>', "the subject's new id in its store")
		.action(async (ref: string, opts, command: Command) => {
			const author = actor(command)
			const subject = parseSubject(opts)
			await withStore(command, (store) => {
				const updated = store.addSubject(ref, subject, author)
				output(updated, () => `${updated.handle} keys: ${updated.subjects.map(subjectText).join(', ')}`)
			})
		})

	channel
		.command('owner <channel> <participant>')
		.description("change an address channel's owner")
		.action(async (ref: string, owner: string, _opts, command: Command) => {
			const author = actor(command)
			await withStore(command, (store) => {
				const logged = store.setOwner(ref, owner, author)
				output(logged, () => `${logged.channel} is now owned by ${owner}`)
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
		.option('--exclude-tag <tag>', 'exclude entries that carry this tag now (repeatable)', collect)
		.option('--author <participant>', 'include entries by this author (repeatable)', collect)
		.option('--exclude-author <participant>', 'exclude entries by this author (repeatable)', collect)
		.action(async (ref: string, name: string, opts, command: Command) => {
			const author = actor(command)
			await withStore(command, (store) => {
				const filter = {
					...(opts.type ? { types: opts.type } : {}),
					...(opts.excludeType ? { excludeTypes: opts.excludeType } : {}),
					...(opts.tag ? { tags: opts.tag } : {}),
					...(opts.author ? { authors: opts.author } : {}),
					...(opts.excludeTag ? { excludeTags: opts.excludeTag } : {}),
					...(opts.excludeAuthor ? { excludeAuthors: opts.excludeAuthor } : {}),
				}
				const logged = store.defineView(ref, name, filter, author)
				output(logged, () => `view ${name} saved on ${logged.channel}`)
			})
		})
}

function parseKind(kind: string | undefined): ChannelKind | undefined {
	if (kind === undefined || kind === 'address' || kind === 'work') return kind
	throw new CynapseError('--kind must be address or work', { exitCode: EXIT_USAGE })
}

function parseSubject(opts: { store?: string; nativeId?: string }): SubjectId {
	if (!opts.store || !opts.nativeId) {
		throw new CynapseError('--store and --native-id go together', { exitCode: EXIT_USAGE })
	}
	return { store: opts.store, nativeId: opts.nativeId }
}
