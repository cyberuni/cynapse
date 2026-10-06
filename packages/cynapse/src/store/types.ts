/**
 * The store contract. Everything above this line — the CLI, the seed, Cortex — talks to a
 * `Store`; the engine behind it (SQLite today, a hub later) is replaceable.
 *
 * Every channel parameter named `ref` accepts a channel's UUID, its current handle, or any
 * handle it used to have. Every entry parameter accepts an entry UUID or the short form
 * `handle#seq`.
 */

import type { SubjectId } from '../channel-key.js'

export type { SubjectId }

export type ParticipantKind = 'agent' | 'human' | 'service'

/**
 * Whether a participant is addressable. The runtime that registered it asserts this;
 * cynapse never measures it (ADR-0013, need 8).
 */
export type ParticipantStatus = 'live' | 'retired'

/** Anything that reads or writes: an agent, a person, a service. */
export interface Participant {
	id: string
	kind: ParticipantKind
	/** A display name; not unique. `resolveAddress` matches it among live participants. */
	name: string
	status: ParticipantStatus
	/**
	 * The registration key, namespaced by the registering unit (`cyberlegion:role/reviewer`);
	 * the id is UUIDv5 of it. Absent on a participant from before the registry.
	 */
	key?: string
	/** The id of the `service` participant that registered this one; itself, for a unit. */
	registeredBy?: string
}

/** What `addParticipant` takes: a bare participant, live and unregistered. */
export type NewParticipant = Pick<Participant, 'id' | 'kind' | 'name'>

export interface RegisterParticipantInput {
	/** Namespaced by the registering unit: `<unit>:<rest>`, such as `cyberlegion:role/reviewer`. */
	key: string
	kind: ParticipantKind
	name: string
	/**
	 * The id of the registering unit, a `service` participant. Omit it for a unit registering
	 * itself, which must then be a `service`.
	 */
	registeredBy?: string
}

/** A participant and its address channel, the channel keyed by its id (ADR-0012). */
export interface RegisteredParticipant {
	participant: Participant
	channel: Channel
}

/** What `resolveAddress` returns. A participant from before the registry has no address channel. */
export interface ResolvedAddress {
	participant: Participant
	channel?: Channel
}

export interface ResolveAddressOptions {
	/** Only participants of these kinds. */
	kinds?: ParticipantKind[]
}

export interface ParticipantQuery {
	status?: ParticipantStatus
	/** Only participants this unit registered. */
	registeredBy?: string
}

export interface ChannelTraits {
	membership: 'open' | 'fixed'
	retention?: string
	/**
	 * Advice to the runtime: whether an entry landing here deserves waking a member.
	 * cynapse never wakes anyone (ADR-0013); a runtime polling `changes` decides.
	 */
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

/**
 * What a channel is keyed by (ADR-0012). An address channel is keyed by something that can
 * receive messages, such as a participant, repository, project or folder, and has an owner.
 * A work channel is about a unit of work, such as an issue, PR, task or mission, and has
 * members but no owner.
 */
export type ChannelKind = 'address' | 'work'

export interface Channel {
	id: string
	handle: string
	kind: ChannelKind
	/** The participant who triages an address channel; absent on a work channel. */
	owner?: string
	/**
	 * The subject keys the channel resolves from: the one its id was derived from first,
	 * then any added when the subject moved. Empty for a channel not keyed by a subject.
	 */
	subjects: SubjectId[]
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
	/**
	 * Present on a tombstone: the entry was deleted, its body, data, refs and tags erased, and
	 * its place kept so `seq`, `parent` and `root` still resolve (ADR-0014).
	 */
	deleted?: { at: string; by: string }
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
	/** An entry is excluded when it currently carries any of these, such as `cynapse.handled`. */
	excludeTags?: string[]
	authors?: string[]
	excludeAuthors?: string[]
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
	/**
	 * The subject the channel is about. The id becomes `channelIdOf(subject)`, and creating
	 * it again, from this key or an alias, returns the existing channel whatever its type.
	 */
	subject?: SubjectId
	/** Defaults to `work`. An address channel needs a `subject` and an `owner`. */
	kind?: ChannelKind
	/** The owner of an address channel. */
	owner?: string
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

/**
 * Which of a channel's entries an `appendUnless` looks for. The filter fields mean what
 * they mean in a view; the fields are ANDed.
 */
export interface EntryMatch extends ViewFilter {
	/** Only direct replies to this entry. */
	parent?: string
}

/** What `appendUnless` did: wrote the entry, or found one already matching and wrote nothing. */
export type ConditionalAppend = { appended: true; entry: Entry } | { appended: false; existing: Entry }

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
	/** Include tombstones, the entries deleted since they were written; hidden by default. */
	includeDeleted?: boolean
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

/** An address for a subject with no native ID, such as a folder; cynapse mints its key. */
export type RegisterAddressInput = Omit<CreateChannelInput, 'anchor' | 'key' | 'subject' | 'kind' | 'owner'> & {
	owner: string
}

export interface ListChannelsQuery {
	kind?: ChannelKind
	type?: string
	/** Channels anchored in this channel. */
	parent?: string
	state?: string
	/** Include channels in the `deleted` lifecycle, hidden by default unless `state` asks for them. */
	includeDeleted?: boolean
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

/** A channel whose `lastSeq` moved after a change token. */
export interface ChannelChange {
	channelId: string
	handle: string
	lastSeq: number
}

/**
 * What `changes` returns: a new token to pass next time, and the channels that moved.
 *
 * The token is opaque and local to one store. It says only that something changed; it is
 * not an order of entries (ADR-0003), so callers never compare, sort or merge tokens.
 */
export interface Changes {
	token: string
	channels: ChannelChange[]
}

export interface Store {
	close(): void

	// participants
	/** Inserts or updates a bare participant by id, outside the registry. */
	addParticipant(participant: NewParticipant): Participant
	/** Ordered by id. */
	participants(query?: ParticipantQuery): Participant[]
	/**
	 * Creates or revives the participant `UUIDv5(key)` and its address channel, and logs
	 * `cynapse.participant.registered` there, in one transaction. Registering a live key again
	 * is a no-op; the same key with a different kind fails with `id_conflict`.
	 */
	registerParticipant(input: RegisterParticipantInput): RegisteredParticipant
	/** Marks the participant retired and logs `cynapse.participant.retired`. It is never deleted. */
	retireParticipant(id: string, author: string): Participant
	/** Renames the participant and its address handle; the old handle stays as an alias. */
	renameParticipant(id: string, name: string, author: string): Participant
	/**
	 * The one live participant whose name, or address channel's handle or alias, is exactly
	 * `name`. More than one fails with `ambiguous_address`, listing the candidates in
	 * `details.candidates`; none fails with `unknown_address`.
	 */
	resolveAddress(name: string, options?: ResolveAddressOptions): ResolvedAddress

	// channels
	createChannel(input: CreateChannelInput): Channel
	/** Registers an address channel keyed by a `cynapse` subject it mints, so each call makes a new one. */
	registerAddress(input: RegisterAddressInput): Channel
	getChannel(ref: string, options?: { as?: string }): Channel | undefined
	/** The channel keyed by this subject, by its first key or an alias. */
	getChannelBySubject(subject: SubjectId): Channel | undefined
	/** Adds an alias key, as when the subject moved and its store gave it a new native ID. */
	addSubject(ref: string, subject: SubjectId, author: string): Channel
	/** Changes an address channel's owner. */
	setOwner(ref: string, owner: string, author: string): Entry
	listChannels(query?: ListChannelsQuery): Channel[]
	children(ref: string): Channel[]
	tree(ref?: string): ChannelTree[]
	brief(ref: string, options?: { as?: string }): Briefing
	renameChannel(ref: string, handle: string, author: string): Channel
	addMember(ref: string, participant: string, role: string, author: string): Entry
	addContext(ref: string, contextRef: string, author: string): Entry
	pin(entryRef: string, author: string): Entry
	/** Moves the channel to a lifecycle state; `deleted` is reserved for `deleteChannel`. */
	setLifecycle(ref: string, state: string, author: string): Entry
	/**
	 * Erases every entry in the channel outside `cynapse.*`, as `deleteEntry` would, moves it to
	 * the `deleted` lifecycle, which listings hide, and logs `cynapse.channel.deleted` with the
	 * count (ADR-0014). The channel still resolves, and `setLifecycle` restores it. Deleting it
	 * again with nothing new to erase returns the last log entry.
	 */
	deleteChannel(ref: string, author: string): Entry
	defineView(ref: string, name: string, filter: ViewFilter, author: string): Entry
	views(ref: string): View[]

	// entries
	append(ref: string, input: AppendInput): Entry
	/**
	 * Appends only if no entry in the channel matches `unless`, checked in the same write
	 * transaction that assigns `seq`, so of two racing writers at most one lands. For the
	 * at-most-once writes, such as ruling on a decision.
	 */
	appendUnless(ref: string, input: AppendInput, unless: EntryMatch): ConditionalAppend
	entry(entryRef: string): Entry | undefined
	entry(ref: string, seq: number): Entry | undefined
	entries(ref: string, query?: EntryQuery): Entry[]
	search(query?: SearchQuery): Entry[]
	/**
	 * Erases an entry's content and leaves a tombstone in its place, logged as
	 * `cynapse.entry.deleted` (ADR-0014). Anyone may delete, since no caller can be verified;
	 * the log names who did. `cynapse.*` entries cannot be deleted. Deleting a tombstone again
	 * returns the entry that logged its delete.
	 */
	deleteEntry(entryRef: string, author: string): Entry
	addTags(entryRef: string, tags: string[], author: string): Entry
	removeTags(entryRef: string, tags: string[], author: string): Entry

	// read state
	markRead(ref: string, participant: string, seq?: number): Member
	unread(participant: string): UnreadCount[]
	/**
	 * The channels whose `lastSeq` moved after `since`, sorted by handle, and a token to pass
	 * next time. Without `since`, every channel. Cheap enough to poll; call `unread` or
	 * `entries` only on what it returns. A token from another store fails with
	 * `foreign_token`, and one it cannot read with `invalid_token`.
	 */
	changes(since?: string): Changes

	// state records
	setState(ref: string, input: SetStateInput, author: string): StateRecord
	states(query?: StateQuery): StateRecord[]
}
