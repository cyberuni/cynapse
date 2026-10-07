---
title: Store
description: "The Store interface: every method, grouped by area, with parameters and return shapes."
---

`Store` is the contract everything above storage talks to: the CLI, the seed, the viewer, and any tool
you write. The engine behind it is replaceable; today it is `SqliteStore`. **Code against `Store`, not
`SqliteStore`**. The interface is what stays stable if the engine changes, and it is the only thing
the CLI's commands depend on (every write goes through it, never raw SQL).

Every `Store` method is synchronous: it returns a value, not a Promise.

```ts
import { openStore, type Store } from 'cynapse'
```

See [Storage](/cynapse/concepts/storage/) for how the SQLite engine orders writes.

## Opening a store

### `openStore(options?)` → `Store`

```ts
interface OpenStoreOptions {
  /** The database file; defaults to resolveDbPath(). ':memory:' for a throwaway store. */
  path?: string
  /** Milliseconds since the epoch; overridable to lay out a timeline. */
  clock?: () => number
}
```

Opens, or creates, the database (and its parent directory, except for `':memory:'`) and returns a `Store`.
Each connection uses WAL mode, `synchronous = NORMAL`, `foreign_keys = ON`, `secure_delete = ON` and a 10 000 ms busy timeout,
so concurrent writers wait for the write lock rather than fail.

Opening also runs the schema migration. It takes the write lock (`BEGIN IMMEDIATE`) on every open, even
when the schema is current, so an open waits behind a writer. A database newer than the installed cynapse
fails with `schema_too_new` and is not written to.

### `resolveDbPath(env?)` → `string`

`$CYNAPSE_HOME/cynapse.db`, where `CYNAPSE_HOME` defaults to `~/.cynapse`. `env` defaults to
`process.env`.

### `SqliteStore`

The stock implementation behind `openStore`, constructed with
`new SqliteStore({ path, clock?, busyTimeoutMs? })`, where `path` is required. Prefer `openStore`; reach
for the class only to set `busyTimeoutMs`, the busy timeout in milliseconds (default `10000`).

## References

Every parameter named `ref` accepts a channel's UUID, its current handle, or any handle it used to have.
Every parameter named `entryRef` accepts an entry UUID or the short form `handle#seq`. A `ref` that
matches nothing throws `no channel found for "<ref>"`; the lookup methods `getChannel` and `entry`
return `undefined` instead.

## Writes always leave a trail

Any method that changes channel metadata or state also appends a `cynapse.*` entry in the same
transaction, and returns that `Entry` (or the changed record). The entry types are
`cynapse.channel.created`, `cynapse.channel.renamed`, `cynapse.member.joined`,
`cynapse.context.added`, `cynapse.pinned`, `cynapse.state.changed`, `cynapse.view.defined`,
`cynapse.label`, `cynapse.channel.subject-added`, `cynapse.channel.owner-changed`,
`cynapse.participant.registered`, `cynapse.participant.retired`, `cynapse.participant.renamed`,
`cynapse.entry.deleted` and `cynapse.channel.deleted`. The [public contract](/cynapse/public-contract/#entry-types)
lists their `data`. An unknown author is registered as a participant of kind `agent` the first time it
writes.

## Lifecycle

### `close()` → `void`

Closes the database connection.

## Participants

| Method | Returns | Notes |
| --- | --- | --- |
| `registerParticipant(input: RegisterParticipantInput)` | `RegisteredParticipant` | `{ key, kind, name, registeredBy? }`. The id is `UUIDv5(key)`. Creates or revives the participant and its address channel, and logs `cynapse.participant.registered`. A live key again is a no-op; another `kind` fails with `id_conflict`. Omit `registeredBy` for a unit registering itself, which must be a `service`. |
| `retireParticipant(id, author)` | `Participant` | Status `retired`, logged as `cynapse.participant.retired`. Never deleted. Retiring again is a no-op. Fails for a participant with no address channel. |
| `renameParticipant(id, name, author)` | `Participant` | Renames it and its address handle; the old handle stays as an alias. Logs `cynapse.participant.renamed`. Fails for a participant with no address channel. |
| `resolveAddress(name, options?: { kinds? })` | `ResolvedAddress` | `{ participant, channel? }`: the one live participant whose id, name, or address handle or alias is exactly `name`. Throws `ambiguous_address` (exit `4`, `details.candidates`) or `unknown_address` (exit `5`). |
| `participants(query?: { status?, registeredBy? })` | `Participant[]` | Ordered by id, for reconciliation. |
| `addParticipant(participant: NewParticipant)` | `Participant` | Insert or update a bare `{ id, kind, name }` outside the registry, with no key or address channel. |

## Channels

| Method | Returns | Notes |
| --- | --- | --- |
| `createChannel(input: CreateChannelInput)` | `Channel` | See below. |
| `registerAddress(input: RegisterAddressInput)` | `Channel` | An address channel for a subject with no native id, such as a folder. It takes a `CreateChannelInput` without `anchor`, `key`, `subject` and `kind`, and with a required `owner`. cynapse mints a `cynapse` subject key, so each call makes a new channel. |
| `getChannel(ref, options?: { as?: string })` | `Channel \| undefined` | `as` fills `stats.unread` for that participant. |
| `getChannelBySubject(subject: SubjectId)` | `Channel \| undefined` | The channel keyed by this subject, by its first key or an added one. |
| `addSubject(ref, subject, author)` | `Channel` | Adds an alias key, as when the subject moved and its store gave it a new native id. Logs `cynapse.channel.subject-added`. A subject that keys another channel throws. |
| `setOwner(ref, owner, author)` | `Entry` | Changes an address channel's owner and logs `cynapse.channel.owner-changed`. A work channel throws. |
| `listChannels(query?: ListChannelsQuery)` | `Channel[]` | Oldest first. Filters: `kind`, `type`, `parent`, `state`. Hides deleted channels unless `includeDeleted` is set or `state` is `deleted`. |
| `children(ref)` | `Channel[]` | Channels anchored directly in this channel. Hides deleted channels. |
| `tree(ref?)` | `ChannelTree[]` | From `ref`, or from every channel with no parent. Hides deleted channels, except a `ref` you name. |
| `brief(ref, options?: { as?: string })` | `Briefing` | The one-call briefing: channel, open state records, pinned entries, views, children. |
| `renameChannel(ref, handle, author)` | `Channel` | The old handle stays as an alias. A handle owned by another channel throws. |
| `addMember(ref, participant, role, author)` | `Entry` | Re-adding a member updates the role. |
| `addContext(ref, contextRef, author)` | `Entry` | Adds a [reference shorthand](/cynapse/api/refs/) to the channel's context. |
| `pin(entryRef, author)` | `Entry` | Pins the entry in its own channel. A deleted entry throws. |
| `setLifecycle(ref, state, author)` | `Entry` | Moves the channel to a lifecycle state. `deleted` is reserved for `deleteChannel`; any other state restores a deleted channel. |
| `deleteChannel(ref, author)` | `Entry` | Erases every entry outside `cynapse.*`, leaving tombstones, moves the channel to `deleted`, and returns the `cynapse.channel.deleted` entry (`{ count, from? }`). Anyone may delete. The channel still resolves by `ref`. Nothing new to erase on a deleted channel returns the last delete. |
| `defineView(ref, name, filter, author)` | `Entry` | Saves or replaces a named [`ViewFilter`](/cynapse/api/types/#view-and-viewfilter). |
| `views(ref)` | `View[]` | The channel's saved views, ordered by name. |

### `createChannel(input)`

```ts
interface CreateChannelInput {
  handle: string
  type: string
  title: string
  author: string
  purpose?: string
  anchor?: string            // an entry; the channel id becomes UUIDv5 of the anchor's id
  key?: string               // a natural key; the channel id becomes UUIDv5 of it
  subject?: SubjectId        // the id becomes channelIdOf(subject); takes no anchor or key
  kind?: 'address' | 'work'  // defaults to 'work'; an address channel needs a subject and an owner
  owner?: string             // the owner of an address channel; a work channel takes none
  traits?: Partial<ChannelTraits>
  conventions?: string[]
  state?: string             // initial lifecycle state; defaults to 'active'
  members?: { participant: string; role?: string }[]  // role defaults to 'member'
  context?: string[]         // reference shorthands, such as 'gh:org/repo#12'
}
```

The id is a UUIDv7 unless `anchor`, `key` or `subject` is given, in which case it is derived, which makes
creation idempotent. A repeat call with a derived id returns the existing channel. It throws an error with
`code: 'id_conflict'` when the stored channel differs in `kind` or `owner`, and, for an `anchor` or `key`,
also in handle (the old handles count), `type`, `title` or `traits`. A `subject` channel is shared by every
consumer of the subject, so its handle, type and title are not compared. A `key` that starts with
`subject:` throws. `traits` defaults to `{ membership: 'open', wake: false }`. A handle is letters,
digits and `. _ / : -`, starts with a letter or digit, must not look like a UUID, and must not be taken.

`members` and `context` are added in the creating transaction, each as its own
`cynapse.member.joined` or `cynapse.context.added` entry after `cynapse.channel.created`, so a failed
create leaves no channel behind. A repeat create of a derived-id channel adds them to the existing
channel, as `addMember` and `addContext` would.

## Entries

| Method | Returns | Notes |
| --- | --- | --- |
| `append(ref, input: AppendInput)` | `Entry` | Idempotent when `input.id` is given. |
| `appendUnless(ref, input: AppendInput, unless: EntryMatch)` | `ConditionalAppend` | Appends only if no entry matches `unless`; for at-most-once writes. |
| `entry(entryRef)` | `Entry \| undefined` | By UUID or `handle#seq`. Returns a tombstone for a deleted entry. |
| `entry(ref, seq)` | `Entry \| undefined` | A channel and a `seq`. |
| `entries(ref, query?: EntryQuery)` | `Entry[]` | In `seq` order. |
| `search(query?: SearchQuery)` | `Entry[]` | Across channels, in id (so creation-time) order. Never returns tombstones. |
| `addTags(entryRef, tags, author)` | `Entry` | Writes a `cynapse.label` entry; returns it. A deleted entry throws. |
| `removeTags(entryRef, tags, author)` | `Entry` | Same, removing. |
| `deleteEntry(entryRef, author)` | `Entry` | Erases the entry's content and leaves a tombstone; returns the `cynapse.entry.deleted` entry (`{ target, seq }`). Anyone may delete, since no caller can be verified; `cynapse.*` entries cannot be deleted. Again on a tombstone returns the entry that logged its delete. |

### `append(ref, input)`

```ts
interface AppendInput {
  id?: string                // supply to make the write idempotent; minted (UUIDv7) when absent
  author: string
  type: string
  tags?: string[]
  parent?: string            // the entry this replies to, in the same channel
  refs?: string[]
  body?: string
  data?: Record<string, unknown>
}
```

`seq` is assigned for you, one past the channel's last. Re-appending an `id` that exists with the same
channel, author, type, parent, body, data, tags and refs returns the stored entry and writes nothing; the
same `id` with any difference throws an error with `code: 'id_conflict'`. A `parent` in another channel
throws, and so does a `parent` that was deleted. A non-UUID `id` throws, and any UUID is accepted.

Tags are stored as a sorted set. The `tags` on a returned `Entry` are the *current* set (those given at
write time adjusted by later `cynapse.label` entries), but the idempotency comparison uses only the tags
given at write time.

The reserved tag `cynapse.handled` is checked on every write that adds it, including `append`. See the
[public contract](/cynapse/public-contract/#reserved-tags).

### `appendUnless(ref, input, unless)`

```ts
interface EntryMatch extends ViewFilter {   // types, excludeTypes, tags, excludeTags, authors, excludeAuthors
  parent?: string      // only direct replies to this entry
}

type ConditionalAppend =
  | { appended: true; entry: Entry }       // the entry written
  | { appended: false; existing: Entry }   // the earliest entry that matched; nothing written
```

Appends `input` as `append` does, unless an entry in the channel already matches `unless`. The check runs
inside the same write transaction that assigns `seq`, so when several writers race (separate
processes included), at most one of them lands. Deleted entries never match. Use it for writes that may
happen only once, such as ruling on a decision:

```ts
store.appendUnless(
  'truss-auth',
  { author: 'council', type: 'truss.ratify', parent: 'truss-auth#5' },
  { parent: 'truss-auth#5', types: ['truss.ratify', 'truss.override'] },
)
```

The filter fields mean what they mean in a [view](/cynapse/api/types/#view-and-viewfilter), and all the
given fields must hold. A retry of the write that already landed (the same `input.id`) returns
`appended: true` with that entry, as `append` would.

### `entries(ref, query)`

```ts
interface EntryQuery extends ViewFilter {   // types, excludeTypes, tags, excludeTags, authors, excludeAuthors
  afterSeq?: number
  limit?: number
  view?: string        // a saved view; its filter is combined with the other options
  unreadFor?: string   // only entries after this participant's cursor, not written by them
  fromSummary?: boolean// start at the latest `cynapse.summary` entry, if any
  metaOnly?: boolean   // no body, no data
  root?: string        // only this thread: the root entry and every reply under it
  includeDeleted?: boolean // include tombstones, hidden by default
}
```

`types` and `excludeTypes` accept an exact type or a namespace prefix ending in `.*` (`sdd.*`). Within
one list values are alternatives; the lists are ANDed. `excludeTags` drops an entry that carries any of
those tags in its current set, so removing a tag brings the entry back. When a `view` is given, its
`types`, `tags` and `authors` intersect with the query's, and its exclusions add to the query's. A `view` that does not exist throws
`no view named "<name>" on channel <ref>`.

### `search(query)`

```ts
interface SearchQuery extends ViewFilter {
  channels?: string[]   // channel refs; all channels when absent
  limit?: number
  metaOnly?: boolean
}
```

The same filters as `entries`, across channels. `search` has no `includeDeleted`: it never returns
tombstones.

### Waiting for a reply

`waitForReply`, the poll loop behind `cynapse entry wait`, is not exported. To wait in code, poll for the
first entry in the thread that you did not write:

```ts
const reply = store.entries('truss-auth', {
  root: 'truss-auth#5',
  afterSeq: 5,
  excludeAuthors: ['alice'],
  limit: 1,
})[0]
```

Run it on an interval until it returns an entry or your deadline passes. Call `changes` first to skip
polls when nothing moved.

## Read state

| Method | Returns | Notes |
| --- | --- | --- |
| `markRead(ref, participant, seq?)` | `Member` | Moves the cursor forward to `seq`; without `seq`, to the channel's latest entry. Never backwards; clamped to the last `seq`. |
| `changes(since?)` | `Changes` | The channels whose last `seq` moved after the token `since`, ordered by handle, plus a new token. Without `since`, every channel. An indexed read, cheap to poll. A token from another store throws `foreign_token`; an unreadable one, `invalid_token`. |
| `unread(participant)` | `UnreadCount[]` | Channels with unread entries, ordered by handle: those the participant is a member of, and those where a thread they wrote in has a reply after both their cursor and their own last entry in that thread. Entries the participant wrote and tombstones do not count. A registered participant owns its address channel but is not a member of it, so that channel is not in its `unread`. |

`markRead` works for a participant who is not a member and reports their role as `reader`.
`UnreadCount` is `{ channelId, handle, count }`. See [Read state](/cynapse/concepts/read-state/).
`Changes` is `{ token, channels: { channelId, handle, lastSeq }[] }`. The token is opaque and local to
one store, and it is not an order of entries. See [Knowing that something arrived](/cynapse/concepts/messaging/#knowing-that-something-arrived).

## State records

| Method | Returns | Notes |
| --- | --- | --- |
| `setState(ref, input: SetStateInput, author)` | `StateRecord` | Creates or replaces the record with that `key`; logs a `cynapse.state.changed` entry. `kind: 'lifecycle'` throws; use `setLifecycle`. |
| `states(query?: StateQuery)` | `StateRecord[]` | Filters: `channel`, `kind`, `status` (`'open'` or `'resolved'`), `subject`. |

```ts
interface SetStateInput {
  key: string
  kind: string
  status: 'open' | 'resolved'
  subject?: string
  entryId?: string
  value?: unknown
}
```

See [State and lifecycle](/cynapse/concepts/state-and-lifecycle/) and the
[`StateRecord`](/cynapse/api/types/#staterecord) type.

## Views

`defineView` and `views` are listed under [Channels](#channels). A view is applied by passing its name as
`EntryQuery.view`. See [Views](/cynapse/concepts/views/).

## Query and result types

`ListChannelsQuery`, `EntryQuery`, `SearchQuery`, `StateQuery`, `ChannelTree`, `Briefing` and
`UnreadCount` are exported types; the data model they return is on the [Types](/cynapse/api/types/) page.
