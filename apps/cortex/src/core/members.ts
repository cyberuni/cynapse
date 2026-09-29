// Who is in a stream, how far they have read, and who is waiting on whom.
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
	const stream = store.getStream(ref)
	if (!stream) return []
	const entries = store.entries(stream.id)
	const kinds = new Map(store.participants().map((p) => [p.id, p.kind]))
	return stream.members.map((m) => ({
		...m,
		unread: entries.filter((e) => e.seq > m.cursor && e.author !== m.participant).length,
		kind: kinds.get(m.participant),
	}))
}

export type Wait = {
	/** A participant, or a stream handle when the stream itself is waiting. */
	waiter: string
	on: string
	stream: string
	seq?: number
	kind: string
}

export function waits(store: Store, ref?: string): Wait[] {
	const handles = new Map(store.listStreams().map((s) => [s.id, s.handle]))
	return store.states({ stream: ref, status: 'open' }).flatMap((record): Wait[] => {
		const stream = handles.get(record.streamId) ?? record.streamId
		if (record.kind === 'pending-answers') {
			return waitingOf(record.value).map((on) => ({ waiter: stream, on, stream, kind: record.kind }))
		}
		if (record.kind === 'needs-input' && record.subject) {
			const asked = record.entryId ? store.entry(record.entryId) : undefined
			return [{ waiter: asked?.author ?? stream, on: record.subject, stream, seq: asked?.seq, kind: record.kind }]
		}
		return []
	})
}
