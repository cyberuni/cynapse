// The part of the cynapse `Store` that the GUI reads and writes. The types are cynapse's
// own, so they cannot drift; `Store` narrows to the methods the GUI calls, which is all an
// in-memory test double has to implement.
import type { Store as CynapseStore } from 'cynapse'

export type {
	AppendInput,
	Channel,
	ConditionalAppend,
	Entry,
	EntryMatch,
	EntryQuery,
	Participant,
	SearchQuery,
	SetStateInput,
	StateQuery,
	StateRecord,
	View,
} from 'cynapse'

export type Store = Pick<
	CynapseStore,
	| 'listChannels'
	| 'getChannel'
	| 'children'
	| 'entries'
	| 'entry'
	| 'search'
	| 'states'
	| 'unread'
	| 'views'
	| 'participants'
	| 'append'
	| 'appendUnless'
	| 'markRead'
	| 'setState'
>

/** The participant id the Council reads and writes as. */
export const COUNCIL = 'council'
