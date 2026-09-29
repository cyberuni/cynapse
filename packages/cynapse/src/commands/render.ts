import { renderRef } from '../refs.js'
import type { Briefing, Entry, StateRecord, Stream, StreamTree } from '../store/types.js'

/** One line per entry: `auth#3  alice  sdd.decision  [tags]  first line of body`. */
export function entryLine(entry: Entry): string {
	const tags = entry.tags.length ? `  [${entry.tags.join(', ')}]` : ''
	const reply = entry.parentSeq ? `  ↳${entry.stream}#${entry.parentSeq}` : ''
	const firstLine = entry.body.split('\n', 1)[0] ?? ''
	const summary = firstLine || (entry.data ? JSON.stringify(entry.data) : '')
	return `${entry.stream}#${entry.seq}  ${entry.createdAt}  ${entry.author}  ${entry.type}${tags}${reply}${summary ? `  ${truncate(summary, 100)}` : ''}`
}

export function entryDetail(entry: Entry): string {
	const lines = [
		`${entry.stream}#${entry.seq}  ${entry.type}  by ${entry.author}`,
		`id: ${entry.id}`,
		`created: ${entry.createdAt}  recorded: ${entry.recordedAt}`,
	]
	if (entry.parent) lines.push(`parent: ${entry.stream}#${entry.parentSeq}  root: ${entry.stream}#${entry.rootSeq}`)
	if (entry.tags.length) lines.push(`tags: ${entry.tags.join(', ')}`)
	if (entry.refs.length) lines.push(`refs: ${entry.refs.map((ref) => renderRef(ref).markdown).join(', ')}`)
	if (entry.data) lines.push(`data: ${JSON.stringify(entry.data)}`)
	if (entry.body) lines.push('', entry.body)
	return lines.join('\n')
}

export function streamLine(stream: Stream): string {
	const parent = stream.parent ? '  (child)' : ''
	return `${stream.handle}  ${stream.type}  ${stream.state}  ${stream.stats.entries} entries${parent}  ${stream.title}`
}

export function stateLine(state: StateRecord, handle?: string): string {
	const subject = state.subject ? ` → ${state.subject}` : ''
	const value = state.value === undefined ? '' : `  ${truncate(JSON.stringify(state.value), 80)}`
	return `${handle ? `${handle}  ` : ''}${state.key}  ${state.kind}  ${state.status}${subject}${value}`
}

export function briefing(brief: Briefing): string {
	const { stream } = brief
	const lines = [`${stream.handle}  ${stream.type}  ${stream.state}`, stream.title]
	if (stream.purpose) lines.push(`purpose: ${stream.purpose}`)
	if (stream.parent) lines.push(`parent anchor: ${stream.parent.entryId} (seq ${stream.parent.seq})`)
	if (stream.aliases.length) lines.push(`aliases: ${stream.aliases.join(', ')}`)
	lines.push(
		`members: ${stream.members.length ? stream.members.map((m) => `${m.participant} (${m.role}, read ${m.cursor})`).join(', ') : 'none'}`,
	)
	if (stream.context.length) lines.push(`context: ${stream.context.map((ref) => renderRef(ref).markdown).join(', ')}`)
	if (stream.conventions.length) lines.push(`conventions: ${stream.conventions.join(', ')}`)
	const unread = stream.stats.unread === undefined ? '' : `, ${stream.stats.unread} unread`
	lines.push(`stats: ${stream.stats.entries} entries, last seq ${stream.stats.lastSeq}${unread}`)
	if (brief.states.length) lines.push('open state:', ...brief.states.map((s) => `  ${stateLine(s)}`))
	if (brief.pinned.length) lines.push('pinned:', ...brief.pinned.map((e) => `  ${entryLine(e)}`))
	if (brief.views.length) lines.push(`views: ${brief.views.map((v) => v.name).join(', ')}`)
	if (brief.children.length)
		lines.push('children:', ...brief.children.map((c) => `  ${c.handle}  ${c.type}  ${c.state}`))
	return lines.join('\n')
}

export function treeLines(trees: StreamTree[], depth = 0): string[] {
	return trees.flatMap((tree) => [
		`${'  '.repeat(depth)}${streamLine(tree.stream)}`,
		...treeLines(tree.children, depth + 1),
	])
}

function truncate(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
