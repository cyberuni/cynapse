---
title: Store
description: The Store interface — every method, grouped by area, with parameters and return shapes.
---

`Store` is the contract everything above storage talks to: the CLI, the seed, the viewer, and any tool
you write. The engine behind it is replaceable; today it is `SqliteStore`. **Code against `Store`, not
`SqliteStore`** — the interface is what stays stable if the engine changes, and it is the only thing
the CLI's commands depend on (every write goes through it, never raw SQL).

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

Opens, or creates, the database (and its parent directory) and returns a `Store`. Opening applies the
schema, turns on WAL mode, and sets a 10 second busy timeout so concurrent writers wait for the write
lock rather than fail.

### `resolveDbPath(env?)` → `string`

`$CYNAPSE_HOME/cynapse.db`, where `CYNAPSE_HOME` defaults to `~/.cynapse`. `env` defaults to
`process.env`.

### `SqliteStore`

The stock implementation behind `openStore`, constructed with
`new SqliteStore({ path, clock?, busyTimeoutMs? })`. Prefer `openStore`; reach for the class only to set
`busyTimeoutMs`.

## References

Every parameter named `ref` accepts a channel's UUID, its current handle, or any handle it used to have.
Every parameter named `entryRef` accepts an entry UUID or the short form `handle#seq`. A `ref` that
matches nothing throws `no channel found for "<ref>"`; the lookup methods `getChannel` and `entry`
return `undefined` instead.

## Writes always leave a trail

Any method that changes channel metadata or state also appends a `cynapse.*` entry in the same
transaction, and returns that `Entry` (or the changed record). The entry types are
`cynapse.channel.created`, `cynapse.channel.renamed`, `cynapse.member.joined`,
`cynapse.context.added`, `cynapse.pinned`, `cynapse.state.changed`, `cynapse.view.defined` and
`cynapse.label`. An unknown author is registered as a participant of kind `agent` the first time it
writes.

## Lifecycle

### `close()` → `void`

Closes the database connection.

## Participants

| Method | Returns | Notes |
| --- | --- | --- |
| `registerParticipant(input: RegisterParticipantInput)` | `RegisteredParticipant` | `{ key, kind, name, registeredBy? }`. The id is `UUIDv5(key)`. Creates or revives the participant and its address channel, and logs `cynapse.participant.registered`. A live key again is a no-op; another `kind` fails with `id_conflict`. Omit `registeredBy` for a unit registering itself, which must be a `service`. |
| `retireParticipant(id, author)` | `Participant` | Status `retired`, logged as `cynapse.participant.retired`. Never deleted. |
| `renameParticipant(id, name, author)` | `Participant` | Renames it and its address handle; the old handle stays as an alias. Logs `cynapse.participant.renamed`. |
| `resolveAddress(name, options?: { kinds? })` | `ResolvedAddress` | `{ participant, channel? }`: the one live participant whose id, name, or address handle or alias is exactly `name`. Throws `ambiguous_address` (exit `4`, `details.candidates`) or `unknown_address` (exit `5`). |
| `participants(query?: { status?, registeredBy? })` | `Participant[]` | Ordered by id, for reconciliation. |
| `addParticipant(participant: NewParticipant)` | `Participant` | Insert or update a bare `{ id, kind, name }` outside the registry, with no key or address channel. |

## Channels

| Method | Returns | Notes |
| --- | --- | --- |
| `createChannel(input: CreateChannelInput)` | `Channel` | See below. |
| `getChannel(ref, options?: { as?: string })` | `Channel \| undefined` | `as` fills `stats.unread` for that participant. |
| `listChannels(query?: ListChannelsQuery)` | `Channel[]` | Oldest first. Filters: `kind`, `type`, `parent`, `state`. Hides deleted channels unless `includeDeleted` is set or `state` is `deleted`. |
| `children(ref)` | `Channel[]` | Channels anchored directly in this channel. |
| `tree(ref?)` | `ChannelTree[]` | From `ref`, or from every channel with no parent. |
| `brief(ref, options?: { as?: string })` | `Briefing` | The one-call briefing: channel, open state records, pinned entries, views, children. |
| `renameChannel(ref, handle, author)` | `Channel` | The old handle stays as an alias. A handle owned by another channel throws. |
| `addMember(ref, participant, role, author)` | `Entry` | Re-adding a member updates the role. |
| `addContext(ref, contextRef, author)` | `Entry` | Adds a [reference shorthand](/cynapse/api/refs/) to the channel's context. |
| `pin(entryRef, author)` | `Entry` | Pins the entry in its own channel. |
| `setLifecycle(ref, state, author)` | `Entry` | Moves the channel to a lifecycle state. `deleted` is reserved for `deleteChannel`; any other state restores a deleted channel. |
| `deleteChannel(ref, author)` | `Entry` | Erases every entry outside `cynapse.*`, leaving tombstones, moves the channel to `deleted`, and returns the `cynapse.channel.deleted` entry (`{ count, from? }`). Anyone may delete. Nothing new to erase on a deleted channel returns the last delete. |
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
  traits?: Partial<ChannelTraits>
  conventions?: string[]
  state?: string             // initial lifecycle state; defaults to 'active'
}
```

The id is a UUIDv7 unless `anchor` or `key` is given, in which case it is derived, which makes creation
idempotent: a repeat call with the same derived id and the same handle, type, title and traits returns
the existing channel, and one that differs throws an error with `code: 'id_conflict'`. `traits` defaults
to `{ membership: 'open', wake: false }`. A handle is letters, digits and `. _ / -`, must not look like
a UUID, and must not be taken.

Unlike the CLI, `createChannel` does not add members or context; call `addMember` and `addContext`.

## Entries

| Method | Returns | Notes |
| --- | --- | --- |
| `append(ref, input: AppendInput)` | `Entry` | Idempotent when `input.id` is given. |
| `appendUnless(ref, input: AppendInput, unless: EntryMatch)` | `ConditionalAppend` | Appends only if no entry matches `unless`; for at-most-once writes. |
| `entry(entryRef)` | `Entry \| undefined` | By UUID or `handle#seq`. |
| `entry(ref, seq)` | `Entry \| undefined` | A channel and a `seq`. |
| `entries(ref, query?: EntryQuery)` | `Entry[]` | In `seq` order. |
| `search(query?: SearchQuery)` | `Entry[]` | Across channels, in id (so creation-time) order. |
| `addTags(entryRef, tags, author)` | `Entry` | Writes a `cynapse.label` entry; returns it. |
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
throws. A non-UUID `id` throws.

Tags are stored as a sorted set. The `tags` on a returned `Entry` are the *current* set — those given at
write time adjusted by later `cynapse.label` entries — but the idempotency comparison uses only the tags
given at write time.

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
inside the same write transaction that assigns `seq`, so when several writers race — separate
processes included — at most one of them lands. Use it for writes that may happen only once, such as
ruling on a decision:

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
those tags in its current set, so removing a tag brings the entry back. A view's exclusions add to the
query's. A `view` that does not exist throws
`no view named "<name>" on channel <ref>`.

### `search(query)`

```ts
interface SearchQuery extends ViewFilter {
  channels?: string[]   // channel refs; all channels when absent
  limit?: number
  metaOnly?: boolean
}
```

The same filters as `entries`, across channels.

## Read state

| Method | Returns | Notes |
| --- | --- | --- |
| `markRead(ref, participant, seq?)` | `Member` | Moves the cursor forward to `seq`, or to the last entry. Never backwards; clamped to the last `seq`. |
| `changes(since?)` | `Changes` | The channels whose last `seq` moved after the token `since`, ordered by handle, plus a new token. Without `since`, every channel. An indexed read, cheap to poll. A token from another store throws `foreign_token`; an unreadable one, `invalid_token`. |
| `unread(participant)` | `UnreadCount[]` | Channels with unread entries, ordered by handle: those the participant is a member of, and those where a thread they wrote in has a reply after both their cursor and their own last entry in that thread. Entries the participant wrote do not count. |

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
