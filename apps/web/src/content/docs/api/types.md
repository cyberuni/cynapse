---
title: Types
description: The data model — Participant, Channel, Entry, Member, ChannelTraits, Anchor and the records around them.
---

All of these are exported from `cynapse` as types (`import type { Channel, Entry } from 'cynapse'`) and
are what [`Store`](/cynapse/api/store/) methods accept and return. Timestamps are ISO 8601 strings.

## `Participant`

Anything that reads or writes: an agent, a person, a service. See
[Participants](/cynapse/concepts/participants/).

```ts
type ParticipantKind = 'agent' | 'human' | 'service'

interface Participant {
  id: string
  kind: ParticipantKind
  name: string
}
```

## `Channel`

A named, ordered log of entries. See [Channels](/cynapse/concepts/channels/).

```ts
interface Channel {
  id: string              // UUID: v7 when minted, v5 when derived from an anchor or key
  handle: string          // the current human-readable name
  aliases: string[]       // handles it used to have; they still resolve
  type: string            // namespaced, defined by the consumer, e.g. 'sdd.mission'
  title: string
  purpose?: string
  parent?: Anchor         // set on a child channel
  members: Member[]
  context: string[]       // reference shorthands, e.g. 'gh:cyberuni/cynapse#12'
  traits: ChannelTraits
  state: string           // the lifecycle state: 'active', 'paused', 'reconciled', ...
  pinned: number[]        // seqs of the pinned entries
  conventions: string[]   // names of the conventions that apply, plugin-prefixed
  stats: ChannelStats
  createdAt: string
}
```

### `ChannelTraits`

Behaviour switches stored on the channel. See [Types, tags and traits](/cynapse/concepts/types-tags-traits/).

```ts
interface ChannelTraits {
  membership: 'open' | 'fixed'
  retention?: string
  wake: boolean           // whether members are woken when an entry lands
  defaultView?: string
}
```

A new channel gets `{ membership: 'open', wake: false }` unless `createChannel` says otherwise.

### `Member`

```ts
interface Member {
  participant: string
  role: string
  cursor: number          // the last seq this member has read; 0 when nothing
}
```

### `Anchor`

The entry in a parent channel that a child channel branches from.

```ts
interface Anchor {
  channelId: string
  entryId: string
  seq: number
}
```

### `ChannelStats`

```ts
interface ChannelStats {
  entries: number
  lastSeq: number
  lastAt?: string
  unread?: number         // present only when read on behalf of a participant
}
```

### `ChannelTree`

```ts
interface ChannelTree {
  channel: Channel
  children: ChannelTree[]
}
```

## `Entry`

An immutable record in a channel. See [Entries](/cynapse/concepts/entries/).

```ts
interface Entry {
  id: string              // UUIDv7 minted by the writer; also the idempotency key
  channelId: string
  channel: string         // the channel's current handle: `${channel}#${seq}` is the short reference
  seq: number             // arrival order within the channel
  author: string
  type: string
  tags: string[]          // the current set: write-time tags adjusted by cynapse.label entries
  parent?: string
  parentSeq?: number
  root?: string
  rootSeq?: number
  refs: string[]
  body: string            // Markdown; '' when empty or read metadata-only
  data?: Record<string, unknown>   // typed payload; absent when read metadata-only
  createdAt: string       // when the writer minted it, from the UUIDv7
  recordedAt: string      // when it arrived in the channel
}
```

## `StateRecord`

What is true on a channel right now: a pending answer, a needs-input, a lease. See
[State and lifecycle](/cynapse/concepts/state-and-lifecycle/).

```ts
type StateStatus = 'open' | 'resolved'

interface StateRecord {
  channelId: string
  key: string             // unique within the channel
  kind: string
  status: StateStatus
  subject?: string        // the participant it waits on or is held by
  entryId?: string
  value?: unknown
  seq: number             // the entry that logged the latest transition
  updatedAt: string
}
```

## `View` and `ViewFilter`

A saved filter over a channel's entries. See [Views](/cynapse/concepts/views/).

```ts
interface ViewFilter {
  types?: string[]        // exact types, or a prefix ending in '.*' ('sdd.*')
  excludeTypes?: string[]
  tags?: string[]         // an entry matches when it carries any of these
  excludeTags?: string[]  // excluded when it carries any of these now
  authors?: string[]
  excludeAuthors?: string[]
}

interface View {
  channelId: string
  name: string
  filter: ViewFilter
}
```

## `Briefing`

The result of [`brief`](/cynapse/api/store/#channels): everything needed to start work on a channel in
one call.

```ts
interface Briefing {
  channel: Channel
  states: StateRecord[]   // open state records only
  pinned: Entry[]
  views: View[]
  children: Pick<Channel, 'id' | 'handle' | 'type' | 'title' | 'state'>[]
}
```

## `UnreadCount`

```ts
interface UnreadCount {
  channelId: string
  handle: string
  count: number
}
```

## Inputs and queries

`CreateChannelInput`, `AppendInput`, `EntryMatch`, `ConditionalAppend`, `SetStateInput`,
`ListChannelsQuery`, `EntryQuery`, `SearchQuery` and `StateQuery` are documented with the methods that take them on the [Store](/cynapse/api/store/)
page.
