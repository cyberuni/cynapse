// The Council's few write actions, written as ordinary entries and state changes.
import { COUNCIL, type Entry, type Store } from './model.ts'

export class ActionError extends Error {}

export function answer(store: Store, input: { stream: string; key: string; body: string; choice?: string }): Entry {
	const record = store
		.states({ stream: input.stream, kind: 'needs-input', status: 'open', subject: COUNCIL })
		.find((r) => r.key === input.key)
	if (!record) throw new ActionError(`no open needs-input '${input.key}' for the Council in ${input.stream}`)
	const entry = store.append(input.stream, {
		author: COUNCIL,
		type: 'council.answer',
		body: input.body,
		parent: record.entryId,
		...(input.choice !== undefined && {
			data: { choice: input.choice, question: (record.value as { question?: unknown } | undefined)?.question },
		}),
	})
	store.setState(
		input.stream,
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
	return store.append(decision.streamId, {
		author: COUNCIL,
		type: `${decision.type.slice(0, -'.decision'.length)}.${input.ruling}`,
		body: input.body ?? (input.ruling === 'ratify' ? 'Ratified.' : ''),
		parent: decision.id,
	})
}
