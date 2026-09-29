// The subset of the cynapse library's `Store` that Cortex reads and writes, mirrored
// from the contract agreed with cynapse-core. Cortex derives every view from these,
// so the fixture and the real store are interchangeable behind `Store`.

export type Member = {
	participant: string
	role: string
	/** The last `seq` this member has read; 0 when nothing is read. */
	cursor: number
}

export type Stream = {
	id: string
	handle: string
	aliases: string[]
	type: string
	title: string
	purpose?: string
	/** Set on a child stream: the anchor entry in the parent it branched from. */
	parent?: { streamId: string; entryId: string; seq: number }
	members: Member[]
	/** Reference shorthands, such as `gh:cyberuni/cynapse#12`. */
	context: string[]
	traits: { membership: 'open' | 'fixed'; retention?: string; wake: boolean; defaultView?: string }
	/** Lifecycle, such as `active` or `reconciled`. */
	state: string
	/** `seq`s of pinned entries. */
	pinned: number[]
	conventions: string[]
	stats: { entries: number; lastSeq: number; lastAt?: string }
	createdAt: string
}

export type Entry = {
	id: string
	streamId: string
	/** The stream's current handle. */
	stream: string
	seq: number
	author: string
	type: string
	tags: string[]
	/** Entry id of the entry this one replies to. */
	parent?: string
	parentSeq?: number
	root?: string
	rootSeq?: number
	refs: string[]
	/** Markdown; '' when there is none. */
	body: string
	data?: Record<string, unknown>
	createdAt: string
	recordedAt: string
}

export type StateRecord = {
	streamId: string
	/** Unique per stream. */
	key: string
	kind: string
	status: 'open' | 'resolved'
	/** The participant the record is about, such as the one whose answer is awaited. */
	subject?: string
	entryId?: string
	value?: unknown
	seq: number
	updatedAt: string
}

export type Participant = { id: string; kind: 'agent' | 'human' | 'service'; name: string }

export type View = {
	streamId: string
	name: string
	filter: { types?: string[]; excludeTypes?: string[]; tags?: string[]; authors?: string[] }
}

export type EntriesQuery = {
	afterSeq?: number
	limit?: number
	types?: string[]
	tags?: string[]
	/** A view name, such as `distilled`; omitted means raw. */
	view?: string
}

export type SearchQuery = { types?: string[]; tags?: string[]; streams?: string[]; authors?: string[] }

export type StatesQuery = { stream?: string; kind?: string; status?: 'open' | 'resolved'; subject?: string }

export type AppendInput = {
	id?: string
	author: string
	type: string
	tags?: string[]
	/** Entry id or `handle#seq`. */
	parent?: string
	refs?: string[]
	body?: string
	data?: Record<string, unknown>
}

export type StateInput = {
	key: string
	kind: string
	status: 'open' | 'resolved'
	subject?: string
	entryId?: string
	value?: unknown
}

/** Every stream argument accepts a handle, an alias, or an id. */
export type Store = {
	listStreams(query?: { type?: string; parent?: string; state?: string }): Stream[]
	getStream(ref: string): Stream | undefined
	children(ref: string): Stream[]
	entries(ref: string, query?: EntriesQuery): Entry[]
	/** An entry id or `handle#seq`. */
	entry(ref: string): Entry | undefined
	search(query: SearchQuery): Entry[]
	states(query?: StatesQuery): StateRecord[]
	unread(participant: string): { streamId: string; handle: string; count: number }[]
	views(ref: string): View[]
	participants(): Participant[]
	append(ref: string, input: AppendInput): Entry
	markRead(ref: string, participant: string, seq?: number): void
	setState(ref: string, input: StateInput, author: string): StateRecord
}

/** The participant id the Council reads and writes as. */
export const COUNCIL = 'council'
