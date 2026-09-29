// The part of the cynapse `Store` that Cortex reads and writes. The types are cynapse's
// own, so they cannot drift; `Store` narrows to the methods Cortex calls, which is all an
// in-memory test double has to implement.
import type { Store as CynapseStore } from 'cynapse'

export type {
	AppendInput,
	Entry,
	EntryQuery,
	Participant,
	SearchQuery,
	SetStateInput,
	StateQuery,
	StateRecord,
	Stream,
	View,
} from 'cynapse'

export type Store = Pick<
	CynapseStore,
	| 'listStreams'
	| 'getStream'
	| 'children'
	| 'entries'
	| 'entry'
	| 'search'
	| 'states'
	| 'unread'
	| 'views'
	| 'participants'
	| 'append'
	| 'markRead'
	| 'setState'
>

/** The participant id the Council reads and writes as. */
export const COUNCIL = 'council'
