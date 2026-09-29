// The landing view: what needs the Council's hands.
import type { Store } from './model.ts'

export type NeedsInput = {
	handle: string
	title: string
	/** State key, used to resolve the record. */
	key: string
	seq: number
	type: string
	author: string
	body: string
	createdAt: string
}

export type PendingArbitration = {
	handle: string
	title: string
	waiting: string[]
	/** `handle#seq` of the anchor in the parent stream. */
	anchor?: string
}

export type UnreadCount = { handle: string; title: string; type: string; count: number }

export type Triage = { needsInput: NeedsInput[]; arbitrations: PendingArbitration[]; unread: UnreadCount[] }

export function triage(store: Store, participant: string): Triage {
	const byId = new Map(store.listStreams().map((s) => [s.id, s]))

	const needsInput = store.states({ kind: 'needs-input', status: 'open', subject: participant }).flatMap((record) => {
		const stream = byId.get(record.streamId)
		const asked = record.entryId ? store.entry(record.entryId) : undefined
		if (!stream || !asked) return []
		return [
			{
				handle: stream.handle,
				title: stream.title,
				key: record.key,
				seq: asked.seq,
				type: asked.type,
				author: asked.author,
				body: asked.body,
				createdAt: asked.createdAt,
			},
		]
	})

	const arbitrations = store.states({ kind: 'pending-answers', status: 'open' }).flatMap((record) => {
		const stream = byId.get(record.streamId)
		if (!stream) return []
		const parent = stream.parent && byId.get(stream.parent.streamId)
		return [
			{
				handle: stream.handle,
				title: stream.title,
				waiting: waitingOf(record.value),
				anchor: parent && stream.parent ? `${parent.handle}#${stream.parent.seq}` : undefined,
			},
		]
	})

	const unread = store
		.unread(participant)
		.flatMap(({ streamId, count }) => {
			const stream = byId.get(streamId)
			return stream ? [{ handle: stream.handle, title: stream.title, type: stream.type, count }] : []
		})
		.sort((a, b) => b.count - a.count)

	return { needsInput, arbitrations, unread }
}

export function waitingOf(value: unknown): string[] {
	const waiting = (value as { waiting?: unknown } | undefined)?.waiting
	return Array.isArray(waiting) ? waiting.filter((w): w is string => typeof w === 'string') : []
}
