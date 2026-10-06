import type { Command } from 'commander'
import { CynapseError, EXIT_USAGE } from '../cli-error.js'
import { output, printEmpty } from '../output.js'
import { renderRef } from '../refs.js'
import type { AppendInput, EntryQuery } from '../store/types.js'
import { actor, collect, parseInteger, parseJson, readBodyFile, withStore } from './context.js'
import { entryDetail, entryLine } from './render.js'
import { waitForReply } from './wait.js'

export function registerEntry(program: Command): void {
	const entry = program.command('entry').description('append and read entries')

	appendOptions(
		entry.command('append <channel>').description('append an entry; re-appending the same --id is a no-op'),
	).action(async (ref: string, opts, command: Command) => {
		const input = appendInput(opts, command)
		await withStore(command, (store) => {
			const appended = store.append(ref, input)
			output(appended, () => `appended ${appended.channel}#${appended.seq}  ${appended.id}`)
		})
	})

	appendOptions(
		entry
			.command('send <name>')
			.description(
				"append to a participant's address channel, resolving the exact name among live participants; never creates one",
			),
	).action(async (name: string, opts, command: Command) => {
		const input = appendInput(opts, command)
		await withStore(command, (store) => {
			const { participant, channel } = store.resolveAddress(name)
			if (!channel) {
				throw new CynapseError(`participant ${participant.id} was never registered, so it has no address channel`)
			}
			const sent = store.append(channel.id, input)
			output(sent, () => `sent ${sent.channel}#${sent.seq}  ${sent.id}`)
		})
	})

	entry
		.command('list <channel>')
		.description('list entries in seq order')
		.option('--unread', 'only entries after your cursor that you did not write (needs --as)')
		.option('--meta-only', 'headers only: no body, no data')
		.option('--from-summary', 'start at the latest cynapse.summary entry')
		.option('--type <type>', 'only this type or prefix.* (repeatable)', collect)
		.option('--exclude-type <type>', 'exclude this type or prefix.* (repeatable)', collect)
		.option('--tag <tag>', 'only entries with this tag (repeatable)', collect)
		.option('--exclude-tag <tag>', 'exclude entries that carry this tag now (repeatable)', collect)
		.option('--author <participant>', 'only entries by this author (repeatable)', collect)
		.option('--exclude-author <participant>', 'exclude entries by this author (repeatable)', collect)
		.option('--view <name>', 'apply a saved view, such as distilled')
		.option('--root <entry>', 'only this thread')
		.option('--after <seq>', 'only entries after this seq')
		.option('--include-deleted', 'include tombstones, the entries deleted since they were written')
		.option('--limit <n>', 'at most this many entries')
		.action(async (ref: string, opts, command: Command) => {
			const query: EntryQuery = {
				types: opts.type,
				excludeTypes: opts.excludeType,
				tags: opts.tag,
				excludeTags: opts.excludeTag,
				authors: opts.author,
				excludeAuthors: opts.excludeAuthor,
				view: opts.view,
				root: opts.root,
				metaOnly: Boolean(opts.metaOnly),
				fromSummary: Boolean(opts.fromSummary),
				includeDeleted: Boolean(opts.includeDeleted),
				...(opts.unread ? { unreadFor: actor(command) } : {}),
				...(opts.after ? { afterSeq: parseInteger(opts.after, '--after') } : {}),
				...(opts.limit ? { limit: parseInteger(opts.limit, '--limit') } : {}),
			}
			await withStore(command, (store) => {
				const entries = store.entries(ref, query)
				if (!entries.length) return printEmpty(opts.unread ? 'unread entries' : 'entries')
				output({ count: entries.length, items: entries }, () => entries.map(entryLine).join('\n'))
			})
		})

	entry
		.command('show <entry>')
		.description('show one entry (id or handle#seq) with its refs rendered as links')
		.action(async (ref: string, _opts, command: Command) => {
			await withStore(command, (store) => {
				const found = store.entry(ref)
				if (!found) throw new CynapseError(`no entry found for "${ref}"`, { code: 'not_found' })
				output({ ...found, links: found.refs.map(renderRef) }, () => entryDetail(found))
			})
		})

	entry
		.command('delete <entry>')
		.description(
			"erase an entry's content, leaving a tombstone that keeps its seq and thread; deleting it again is a no-op (needs --as)",
		)
		.action(async (ref: string, _opts, command: Command) => {
			const author = actor(command)
			await withStore(command, (store) => {
				const logged = store.deleteEntry(ref, author)
				const seq = (logged.data?.seq as number | undefined) ?? 0
				output(logged, () => `deleted ${logged.channel}#${seq}  logged ${logged.channel}#${logged.seq}`)
			})
		})

	entry
		.command('wait <entry>')
		.description("wait for the first reply in the entry's thread from someone other than you (needs --as)")
		.requiredOption('--timeout <seconds>', 'give up after this many seconds, exiting 3')
		.action(async (ref: string, opts, command: Command) => {
			const waiter = actor(command)
			const seconds = Number(opts.timeout)
			if (!Number.isFinite(seconds) || seconds < 0) {
				throw new CynapseError('--timeout must be a number of seconds', { exitCode: EXIT_USAGE })
			}
			await withStore(command, async (store) => {
				const reply = await waitForReply(store, ref, waiter, { timeoutMs: seconds * 1000 })
				output(reply, () => entryDetail(reply))
			})
		})
}

/** The options `entry append` and `entry send` share. */
function appendOptions(command: Command): Command {
	return command
		.requiredOption('--type <type>', 'namespaced entry type, such as sdd.decision')
		.option('--body <text>', 'Markdown body')
		.option('--body-file <path>', 'read the body from a file, or - for stdin')
		.option('--data <json>', 'typed payload as a JSON object')
		.option('--tag <tag>', 'namespaced tag (repeatable)', collect)
		.option('--ref <ref>', 'reference shorthand such as gh:org/repo#12 or handle#seq (repeatable)', collect)
		.option('--parent <entry>', 'the entry this replies to (id or handle#seq)')
		.option('--id <uuid>', 'the entry id (UUIDv7); minted when absent')
}

function appendInput(opts: Record<string, string | string[] | undefined>, command: Command): AppendInput {
	const author = actor(command)
	return {
		id: opts.id as string | undefined,
		author,
		type: opts.type as string,
		body: opts.bodyFile ? readBodyFile(opts.bodyFile as string) : (opts.body as string | undefined),
		data: opts.data ? parseJson(opts.data as string, '--data') : undefined,
		tags: opts.tag as string[] | undefined,
		refs: opts.ref as string[] | undefined,
		parent: opts.parent as string | undefined,
	}
}
