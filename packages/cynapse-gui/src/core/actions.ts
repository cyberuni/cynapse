// The Council's few write actions, written as ordinary entries and state changes.
import { COUNCIL, type Entry, type Store } from './model.ts'

export class ActionError extends Error {
	/** Set when the action conflicts with what is already recorded, such as `already_ruled`. */
	constructor(
		message: string,
		readonly code?: string,
	) {
		super(message)
	}
}

type Ruling = { seq: number; type: string; author: string; body: string }

const isRuling = (e: Entry) => /\.(ratify|override)$/.test(e.type)

/** Each ruled decision in a channel, by the decision's `seq`, with the ruling that settled it. */
export function rulings(store: Store, ref: string): Record<number, Ruling> {
	const out: Record<number, Ruling> = {}
	for (const e of store.entries(ref)) {
		if (isRuling(e) && e.parentSeq !== undefined && !(e.parentSeq in out)) {
			out[e.parentSeq] = { seq: e.seq, type: e.type, author: e.author, body: e.body }
		}
	}
	return out
}

export function answer(store: Store, input: { channel: string; key: string; body: string; choice?: string }): Entry {
	const record = store
		.states({ channel: input.channel, kind: 'needs-input', status: 'open', subject: COUNCIL })
		.find((r) => r.key === input.key)
	if (!record) throw new ActionError(`no open needs-input '${input.key}' for the Council in ${input.channel}`)
	const entry = store.append(input.channel, {
		author: COUNCIL,
		type: 'council.answer',
		body: input.body,
		parent: record.entryId,
		...(input.choice !== undefined && {
			data: { choice: input.choice, question: (record.value as { question?: unknown } | undefined)?.question },
		}),
	})
	store.setState(
		input.channel,
		{
			key: record.key,
			kind: record.kind,
			status: 'resolved',
			subject: COUNCIL,
			entryId: record.entryId,
			value: record.value,
		},
		COUNCIL,
	)
	return entry
}

export function ruleOnDecision(
	store: Store,
	input: { ref: string; ruling: 'ratify' | 'override'; body?: string },
): Entry {
	const decision = store.entry(input.ref)
	if (!decision?.type.endsWith('.decision')) throw new ActionError(`${input.ref} is not a decision`)
	const existing = rulings(store, decision.channelId)[decision.seq]
	if (existing) {
		const verb = existing.type.endsWith('.ratify') ? 'ratified' : 'overridden'
		throw new ActionError(`${input.ref} was already ${verb} in #${existing.seq}`, 'already_ruled')
	}
	const note = input.body?.trim()
	if (input.ruling === 'override' && !note) throw new ActionError('an override needs the Council outcome')
	return store.append(decision.channelId, {
		author: COUNCIL,
		type: `${decision.type.slice(0, -'.decision'.length)}.${input.ruling}`,
		body: note || 'Ratified.',
		parent: decision.id,
	})
}
