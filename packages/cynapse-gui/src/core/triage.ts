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
	/** `handle#seq` of the anchor in the parent channel. */
	anchor?: string
}

type UnreadCount = { handle: string; title: string; type: string; count: number }

export type Triage = { needsInput: NeedsInput[]; arbitrations: PendingArbitration[]; unread: UnreadCount[] }

export function triage(store: Store, participant: string): Triage {
	const byId = new Map(store.listChannels().map((s) => [s.id, s]))

	const needsInput = store.states({ kind: 'needs-input', status: 'open', subject: participant }).flatMap((record) => {
		const channel = byId.get(record.channelId)
		const asked = record.entryId ? store.entry(record.entryId) : undefined
		if (!channel || !asked) return []
		return [
			{
				handle: channel.handle,
				title: channel.title,
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

	const answers = new Map(store.states({ kind: 'pending-answers' }).map((r) => [r.channelId, r]))
	const arbitrations = store.listChannels().flatMap((channel) => {
		const record = answers.get(channel.id)
		const pending = record?.status === 'open'
		const isOpenArbitration = channel.type.endsWith('.arbitration') && !SETTLED.has(channel.state)
		if (!pending && !isOpenArbitration) return []
		const parent = channel.parent && byId.get(channel.parent.channelId)
		return [
			{
				handle: channel.handle,
				title: channel.title,
				state: channel.state,
				waiting: waitingOf(record?.value),
				split: (record?.value as { split?: unknown } | undefined)?.split === true,
				anchor: parent && channel.parent ? `${parent.handle}#${channel.parent.seq}` : undefined,
			},
		]
	})

	const unread = store
		.unread(participant)
		.flatMap(({ channelId, count }) => {
			const channel = byId.get(channelId)
			return channel ? [{ handle: channel.handle, title: channel.title, type: channel.type, count }] : []
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
