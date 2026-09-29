// The landing view: what needs the Council's hands.
import type { Store } from './model.ts'

type NeedsInput = {
	handle: string
	title: string
	/** State key, used to resolve the record. */
	key: string
	seq: number
	type: string
	author: string
	body: string
	createdAt: string
	question?: string
	/** Choices the asker offers; the Council may still answer freely. */
	options?: string[]
}

type PendingArbitration = {
	handle: string
	title: string
	/** Lifecycle, such as `active` or `escalated`. */
	state: string
	waiting: string[]
	/** Every answer is in, but they disagree. */
	split: boolean
	/** `handle#seq` of the anchor in the parent stream. */
	anchor?: string
}

type UnreadCount = { handle: string; title: string; type: string; count: number }

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
				...questionOf(record.value),
			},
		]
	})

	const answers = new Map(store.states({ kind: 'pending-answers' }).map((r) => [r.streamId, r]))
	const arbitrations = store.listStreams().flatMap((stream) => {
		const record = answers.get(stream.id)
		const pending = record?.status === 'open'
		const isOpenArbitration = stream.type.endsWith('.arbitration') && !SETTLED.has(stream.state)
		if (!pending && !isOpenArbitration) return []
		const parent = stream.parent && byId.get(stream.parent.streamId)
		return [
			{
				handle: stream.handle,
				title: stream.title,
				state: stream.state,
				waiting: waitingOf(record?.value),
				split: (record?.value as { split?: unknown } | undefined)?.split === true,
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

/** Lifecycle states in which an arbitration no longer needs anyone. */
const SETTLED = new Set(['closed', 'resolved', 'reconciled', 'archived'])

function questionOf(value: unknown): { question?: string; options?: string[] } {
	const v = value as { question?: unknown; options?: unknown } | undefined
	return {
		...(typeof v?.question === 'string' && { question: v.question }),
		...(Array.isArray(v?.options) && { options: v.options.filter((o): o is string => typeof o === 'string') }),
	}
}

export function waitingOf(value: unknown): string[] {
	const waiting = (value as { waiting?: unknown } | undefined)?.waiting
	return Array.isArray(waiting) ? waiting.filter((w): w is string => typeof w === 'string') : []
}
