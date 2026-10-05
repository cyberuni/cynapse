// Who is in a channel, how far they have read, and who is waiting on whom.
import type { Store } from './model.ts'
import { waitingOf } from './triage.ts'

export type MemberRow = {
	participant: string
	role: string
	cursor: number
	unread: number
	kind?: string
}

export function members(store: Store, ref: string): MemberRow[] {
	const channel = store.getChannel(ref)
	if (!channel) return []
	const entries = store.entries(channel.id)
	const kinds = new Map(store.participants().map((p) => [p.id, p.kind]))
	return channel.members.map((m) => ({
		...m,
		unread: entries.filter((e) => e.seq > m.cursor && e.author !== m.participant).length,
		kind: kinds.get(m.participant),
	}))
}

export type Wait = {
	/** A participant, or a channel handle when the channel itself is waiting. */
	waiter: string
	on: string
	channel: string
	seq?: number
	kind: string
}

export function waits(store: Store, ref?: string): Wait[] {
	const handles = new Map(store.listChannels().map((s) => [s.id, s.handle]))
	return store.states({ channel: ref, status: 'open' }).flatMap((record): Wait[] => {
		const channel = handles.get(record.channelId) ?? record.channelId
		if (record.kind === 'pending-answers') {
			return waitingOf(record.value).map((on) => ({ waiter: channel, on, channel, kind: record.kind }))
		}
		if (record.kind === 'needs-input' && record.subject) {
			const asked = record.entryId ? store.entry(record.entryId) : undefined
			return [{ waiter: asked?.author ?? channel, on: record.subject, channel, seq: asked?.seq, kind: record.kind }]
		}
		return []
	})
}
