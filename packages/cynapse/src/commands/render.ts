import type { SubjectId } from '../channel-key.js'
import { renderRef } from '../refs.js'
import type { Briefing, Channel, ChannelTree, Entry, StateRecord } from '../store/types.js'

/** One line per entry: `auth#3  alice  sdd.decision  [tags]  first line of body`. */
export function entryLine(entry: Entry): string {
	const tags = entry.tags.length ? `  [${entry.tags.join(', ')}]` : ''
	const reply = entry.parentSeq ? `  ↳${entry.channel}#${entry.parentSeq}` : ''
	const firstLine = entry.body.split('\n', 1)[0] ?? ''
	const summary = firstLine || (entry.data ? JSON.stringify(entry.data) : '')
	return `${entry.channel}#${entry.seq}  ${entry.createdAt}  ${entry.author}  ${entry.type}${tags}${reply}${summary ? `  ${truncate(summary, 100)}` : ''}`
}

export function entryDetail(entry: Entry): string {
	const lines = [
		`${entry.channel}#${entry.seq}  ${entry.type}  by ${entry.author}`,
		`id: ${entry.id}`,
		`created: ${entry.createdAt}  recorded: ${entry.recordedAt}`,
	]
	if (entry.parent) lines.push(`parent: ${entry.channel}#${entry.parentSeq}  root: ${entry.channel}#${entry.rootSeq}`)
	if (entry.tags.length) lines.push(`tags: ${entry.tags.join(', ')}`)
	if (entry.refs.length) lines.push(`refs: ${entry.refs.map((ref) => renderRef(ref).markdown).join(', ')}`)
	if (entry.data) lines.push(`data: ${JSON.stringify(entry.data)}`)
	if (entry.body) lines.push('', entry.body)
	return lines.join('\n')
}

export function channelLine(channel: Channel): string {
	const parent = channel.parent ? '  (child)' : ''
	return `${channel.handle}  ${channel.type}  ${channel.state}  ${channel.stats.entries} entries${parent}  ${channel.title}`
}

export function stateLine(state: StateRecord, handle?: string): string {
	const subject = state.subject ? ` → ${state.subject}` : ''
	const value = state.value === undefined ? '' : `  ${truncate(JSON.stringify(state.value), 80)}`
	return `${handle ? `${handle}  ` : ''}${state.key}  ${state.kind}  ${state.status}${subject}${value}`
}

export function briefing(brief: Briefing): string {
	const { channel } = brief
	const lines = [`${channel.handle}  ${channel.type}  ${channel.state}`, channel.title]
	lines.push(channel.owner ? `address of ${channel.owner}` : 'work channel')
	if (channel.subjects.length) lines.push(`keys: ${channel.subjects.map(subjectText).join(', ')}`)
	if (channel.purpose) lines.push(`purpose: ${channel.purpose}`)
	if (channel.parent) lines.push(`parent anchor: ${channel.parent.entryId} (seq ${channel.parent.seq})`)
	if (channel.aliases.length) lines.push(`aliases: ${channel.aliases.join(', ')}`)
	lines.push(
		`members: ${channel.members.length ? channel.members.map((m) => `${m.participant} (${m.role}, read ${m.cursor})`).join(', ') : 'none'}`,
	)
	if (channel.context.length) lines.push(`context: ${channel.context.map((ref) => renderRef(ref).markdown).join(', ')}`)
	if (channel.conventions.length) lines.push(`conventions: ${channel.conventions.join(', ')}`)
	const unread = channel.stats.unread === undefined ? '' : `, ${channel.stats.unread} unread`
	lines.push(`stats: ${channel.stats.entries} entries, last seq ${channel.stats.lastSeq}${unread}`)
	if (brief.states.length) lines.push('open state:', ...brief.states.map((s) => `  ${stateLine(s)}`))
	if (brief.pinned.length) lines.push('pinned:', ...brief.pinned.map((e) => `  ${entryLine(e)}`))
	if (brief.views.length) lines.push(`views: ${brief.views.map((v) => v.name).join(', ')}`)
	if (brief.children.length)
		lines.push('children:', ...brief.children.map((c) => `  ${c.handle}  ${c.type}  ${c.state}`))
	return lines.join('\n')
}

export function treeLines(trees: ChannelTree[], depth = 0): string[] {
	return trees.flatMap((tree) => [
		`${'  '.repeat(depth)}${channelLine(tree.channel)}`,
		...treeLines(tree.children, depth + 1),
	])
}

export function subjectText(subject: SubjectId): string {
	return `${subject.store} ${subject.nativeId}`
}

function truncate(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
