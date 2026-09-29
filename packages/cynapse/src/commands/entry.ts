import type { Command } from 'commander'
import { CynapseError } from '../cli-error.js'
import { output, printEmpty } from '../output.js'
import { renderRef } from '../refs.js'
import type { EntryQuery } from '../store/types.js'
import { actor, collect, parseInteger, parseJson, readBodyFile, withStore } from './context.js'
import { entryDetail, entryLine } from './render.js'

export function registerEntry(program: Command): void {
	const entry = program.command('entry').description('append and read entries')

	entry
		.command('append <stream>')
		.description('append an entry; re-appending the same --id is a no-op')
		.requiredOption('--type <type>', 'namespaced entry type, such as sdd.decision')
		.option('--body <text>', 'Markdown body')
		.option('--body-file <path>', 'read the body from a file, or - for stdin')
		.option('--data <json>', 'typed payload as a JSON object')
		.option('--tag <tag>', 'namespaced tag (repeatable)', collect)
		.option('--ref <ref>', 'reference shorthand such as gh:org/repo#12 or handle#seq (repeatable)', collect)
		.option('--parent <entry>', 'the entry this replies to (id or handle#seq)')
		.option('--id <uuid>', 'the entry id (UUIDv7); minted when absent')
		.action(async (ref: string, opts, command: Command) => {
			const author = actor(command)
			const body = opts.bodyFile ? readBodyFile(opts.bodyFile) : opts.body
			await withStore(command, (store) => {
				const appended = store.append(ref, {
					id: opts.id,
					author,
					type: opts.type,
					body,
					data: opts.data ? parseJson(opts.data, '--data') : undefined,
					tags: opts.tag,
					refs: opts.ref,
					parent: opts.parent,
				})
				output(appended, () => `appended ${appended.stream}#${appended.seq}  ${appended.id}`)
			})
		})

	entry
		.command('list <stream>')
		.description('list entries in seq order')
		.option('--unread', 'only entries after your cursor that you did not write (needs --as)')
		.option('--meta-only', 'headers only: no body, no data')
		.option('--from-summary', 'start at the latest cynapse.summary entry')
		.option('--type <type>', 'only this type or prefix.* (repeatable)', collect)
		.option('--exclude-type <type>', 'exclude this type or prefix.* (repeatable)', collect)
		.option('--tag <tag>', 'only entries with this tag (repeatable)', collect)
		.option('--author <participant>', 'only entries by this author (repeatable)', collect)
		.option('--view <name>', 'apply a saved view, such as distilled')
		.option('--root <entry>', 'only this thread')
		.option('--after <seq>', 'only entries after this seq')
		.option('--limit <n>', 'at most this many entries')
		.action(async (ref: string, opts, command: Command) => {
			const query: EntryQuery = {
				types: opts.type,
				excludeTypes: opts.excludeType,
				tags: opts.tag,
				authors: opts.author,
				view: opts.view,
				root: opts.root,
				metaOnly: Boolean(opts.metaOnly),
				fromSummary: Boolean(opts.fromSummary),
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
				if (!found) throw new CynapseError(`no entry found for "${ref}"`)
				output({ ...found, links: found.refs.map(renderRef) }, () => entryDetail(found))
			})
		})
}
