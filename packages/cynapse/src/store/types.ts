/**
 * The store contract. Everything above this line — the CLI, the seed, Cortex — talks to a
 * `Store`; the engine behind it (SQLite today, a hub later) is replaceable.
 *
 * Every channel parameter named `ref` accepts a channel's UUID, its current handle, or any
 * handle it used to have. Every entry parameter accepts an entry UUID or the short form
 * `handle#seq`.
 */

export type ParticipantKind = 'agent' | 'human' | 'service'

/** Anything that reads or writes: an agent, a person, a service. */
export interface Participant {
	id: string
	kind: ParticipantKind
	name: string
}

export interface ChannelTraits {
	membership: 'open' | 'fixed'
	retention?: string
	/** Whether members are woken when an entry lands. */
	wake: boolean
	defaultView?: string
}

export interface Member {
	participant: string
	role: string
	/** The last seq this member has read; 0 when they have read nothing. */
	cursor: number
}

/** The anchor entry in the parent channel that a child channel branches from. */
export interface Anchor {
	channelId: string
	entryId: string
	seq: number
}

export interface ChannelStats {
	entries: number
	lastSeq: number
	lastAt?: string
	/** Present only when the channel was read on behalf of a participant. */
	unread?: number
}

export interface Channel {
	id: string
	handle: string
	/** Handles this channel used to have; they still resolve. */
	aliases: string[]
	/** Namespaced and defined by the consumer, such as `sdd.mission`. */
	type: string
	title: string
	purpose?: string
	parent?: Anchor
	members: Member[]
	/** Reference shorthands, such as `gh:cyberuni/cynapse#12`. */
	context: string[]
	traits: ChannelTraits
	/** The lifecycle state, such as `active`, `paused` or `reconciled`. */
	state: string
	/** Seqs of the pinned entries. */
	pinned: number[]
	/** Names of the conventions that apply, plugin-prefixed. */
	conventions: string[]
	stats: ChannelStats
	createdAt: string
}

export interface Entry {
	/** UUIDv7 minted by the writer; also the idempotency key. */
	id: string
	channelId: string
	/** The channel's current handle, so `${channel}#${seq}` is the entry's short reference. */
	channel: string
	/** Arrival order within the channel, assigned by the channel's order owner. */
	seq: number
	author: string
	type: string
	/** The current set: tags given at write time, adjusted by later `cynapse.label` entries. */
	tags: string[]
	parent?: string
	parentSeq?: number
	root?: string
	rootSeq?: number
	refs: string[]
	/** Markdown; empty when the entry has none or when read metadata-only. */
	body: string
	/** The typed payload; its shape is decided by `type`. Absent when read metadata-only. */
	data?: Record<string, unknown>
	/** When the writer minted it, from the UUIDv7. */
	createdAt: string
	/** When it arrived in the channel. */
	recordedAt: string
}

export type StateStatus = 'open' | 'resolved'

/** What is true right now on a channel: a pending answer, a needs-input, a lease. */
export interface StateRecord {
	channelId: string
	/** Unique within the channel. */
	key: string
	kind: string
	status: StateStatus
	/** The participant the record is waiting on or held by. */
	subject?: string
	entryId?: string
	value?: unknown
	/** The entry that logged the latest transition. */
	seq: number
	updatedAt: string
}

export interface ViewFilter {
	/** Exact types, or a namespace prefix ending in `.*` (`sdd.*`). */
	types?: string[]
	excludeTypes?: string[]
	/** An entry matches when it carries any of these. */
	tags?: string[]
	authors?: string[]
}

/** A saved filter over a channel's entries, such as `distilled`. */
export interface View {
	channelId: string
	name: string
	filter: ViewFilter
}

export interface CreateChannelInput {
	handle: string
	type: string
	title: string
	author: string
	purpose?: string
	/** Branch from this entry; the channel id becomes UUIDv5 of the anchor's id. */
	anchor?: string
	/** A natural key, such as a DM's participants; the channel id becomes UUIDv5 of it. */
	key?: string
	traits?: Partial<ChannelTraits>
	conventions?: string[]
	/** Initial lifecycle state; defaults to `active`. */
	state?: string
}

export interface AppendInput {
	/** Supply to make the write idempotent; minted when absent. */
	id?: string
	author: string
	type: string
	tags?: string[]
	/** The entry this one replies to, in the same channel. */
	parent?: string
	refs?: string[]
	body?: string
	data?: Record<string, unknown>
}

export interface EntryQuery extends ViewFilter {
	afterSeq?: number
	limit?: number
	/** A view name; its filter is combined with the other options. */
	view?: string
	/** Only entries after this participant's cursor, and not written by them. */
	unreadFor?: string
	/** Start at the latest `cynapse.summary` entry. */
	fromSummary?: boolean
	/** Headers only: no body, no data. */
	metaOnly?: boolean
	/** Only entries in this thread (the root and every reply under it). */
	root?: string
}

export interface SearchQuery extends ViewFilter {
	channels?: string[]
	limit?: number
	metaOnly?: boolean
}

export interface StateQuery {
	channel?: string
	kind?: string
	status?: StateStatus
	subject?: string
}

export interface SetStateInput {
	key: string
	kind: string
	status: StateStatus
	subject?: string
	entryId?: string
	value?: unknown
}

export interface ListChannelsQuery {
	type?: string
	/** Channels anchored in this channel. */
	parent?: string
	state?: string
}

export interface ChannelTree {
	channel: Channel
	children: ChannelTree[]
}

/** The agent's briefing: everything needed to start work on a channel, in one call. */
export interface Briefing {
	channel: Channel
	/** Open state records: pending answers, needs-input, leases. */
	states: StateRecord[]
	pinned: Entry[]
	views: View[]
	children: Pick<Channel, 'id' | 'handle' | 'type' | 'title' | 'state'>[]
}

export interface UnreadCount {
	channelId: string
	handle: string
	count: number
}

export interface Store {
	close(): void

	// participants
	addParticipant(participant: Participant): Participant
	participants(): Participant[]

	// channels
	createChannel(input: CreateChannelInput): Channel
	getChannel(ref: string, options?: { as?: string }): Channel | undefined
	listChannels(query?: ListChannelsQuery): Channel[]
	children(ref: string): Channel[]
	tree(ref?: string): ChannelTree[]
	brief(ref: string, options?: { as?: string }): Briefing
	renameChannel(ref: string, handle: string, author: string): Channel
	addMember(ref: string, participant: string, role: string, author: string): Entry
	addContext(ref: string, contextRef: string, author: string): Entry
	pin(entryRef: string, author: string): Entry
	setLifecycle(ref: string, state: string, author: string): Entry
	defineView(ref: string, name: string, filter: ViewFilter, author: string): Entry
	views(ref: string): View[]

	// entries
	append(ref: string, input: AppendInput): Entry
	entry(entryRef: string): Entry | undefined
	entry(ref: string, seq: number): Entry | undefined
	entries(ref: string, query?: EntryQuery): Entry[]
	search(query?: SearchQuery): Entry[]
	addTags(entryRef: string, tags: string[], author: string): Entry
	removeTags(entryRef: string, tags: string[], author: string): Entry

	// read state
	markRead(ref: string, participant: string, seq?: number): Member
	unread(participant: string): UnreadCount[]

	// state records
	setState(ref: string, input: SetStateInput, author: string): StateRecord
	states(query?: StateQuery): StateRecord[]
}
