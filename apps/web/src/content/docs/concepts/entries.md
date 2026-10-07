---
title: Entries
description: "One item in a channel: UUIDv7 identity, owner-assigned seq, threads, payloads, references and tombstones."
---

An **entry** is one item in a [channel](/cynapse/concepts/channels/): a message, an event,
a decision, an answer, a metadata change. An entry is never edited. Deleting one erases its
content and keeps its place.

## Two identities: `id` and `seq`

| | `id` | `seq` |
| --- | --- | --- |
| What | A UUID, v7 when cynapse mints it | A per-channel integer: 1, 2, 3… |
| Who assigns it | The writer | The channel's order owner |
| Order it gives | Creation time, by the writer's clock | Arrival order in the channel |
| Unique within | The store | The channel |
| Short form | none | `handle#seq`, such as `review-12#6` |

**`id` is the idempotency key.** A writer may supply it (`entry append --id`, any UUID) or
let cynapse mint a UUIDv7. Appending again with the same `id` and the same payload is a
no-op that returns the stored entry. Appending with the same `id` and a different payload
fails with `id_conflict`:

```console
$ cynapse --as alice entry append k2 --type x.n --id 89423797-b748-41cd-b0b4-cee689a8c516 --body different
error: entry id 89423797-b748-41cd-b0b4-cee689a8c516 is already used by k2#4, which differs in body
help: reuse the existing record as it is, or pass a different id or key
```

So a writer that passes `--id` can retry after a timeout without writing twice. Without
`--id`, every call mints a new id, and a retry after an unknown outcome can land the entry
twice.

**`seq` is arrival order, and it has no gaps.** A reader can tell "I have everything up
to 6" from "7 hasn't arrived" from "7 is missing", which a time-sortable id can't do.
Clocks disagree between machines, so ordering by `id` would put some entries behind a
reader's cursor. On one machine, the store's write transaction assigns `seq`
([Guarantees](/cynapse/concepts/guarantees/#ordering)).

An entry carries both times: `createdAt`, read from its UUIDv7, and `recordedAt`, when it
arrived. An entry whose writer supplied an `id` that isn't a UUIDv7 has `createdAt` equal
to `recordedAt`.

## Immutability

A correction or a retraction is a new entry that refers to the old one. A tag added later
is a `cynapse.label` entry, and an entry's current tags are folded from those
([Types, tags and traits](/cynapse/concepts/types-tags-traits/)). Whatever an entry said
when it was read is what it still says, unless it was deleted.

Editing an entry in place is not built. [#62](https://github.com/cyberuni/cynapse/issues/62)
proposes it as an append that reads fold.

## Deleting an entry

Deleting removes what was said and keeps its place
([ADR-0014](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0014-deleting-entries-and-channels.md)).
It was added after 0.1.0. `deleteEntry` (`cynapse entry delete`) erases an entry's body,
data, refs and tags and leaves a **tombstone**: the `id`, `seq`, author, type, `parent` and
`root` stay, and the entry carries `deleted: { at, by }`. The delete is logged as a
`cynapse.entry.deleted` entry in the same channel. Because the row stays, a `seq` is never
handed out twice, replies still resolve their `parent` and `root`, and a reader can tell an
entry removed on purpose from one not received yet.

- cynapse doesn't check who deletes. The `cynapse.entry.deleted` entry records the
  participant the caller named.
- `cynapse.*` entries are the channel's record of itself and can't be deleted. Content
  written into them, such as a state record's `value` or a channel's title, stays.
- `entries` hides tombstones unless asked (`includeDeleted`, `--include-deleted`). `search`,
  unread counts and `appendUnless` skip them. `entry(ref)` still returns the tombstone.
- A tombstone can't be replied to, tagged or pinned. Deleting it again returns the entry
  that logged the delete.
- The erased bytes can stay in the database file and its write-ahead log until SQLite
  reuses those pages ([Guarantees](/cynapse/concepts/guarantees/#deletion)).

`deleteChannel` does the same for every entry in a channel, and hides the channel
([State and lifecycle](/cynapse/concepts/state-and-lifecycle/#deleting-a-channel)).

## Threads

An entry may name a `parent`: the entry it replies to, in the same channel. Its `root` is
set when it is written: the parent's root, or the parent itself. A top-level entry has no
root.

```bash
cynapse --as bob entry append review-12 --type demo.answer --parent review-12#4 --body "No."
cynapse entry list review-12 --root review-12#4     # the whole thread
```

A parent must be in the same channel. A conversation lives in the channel where it began.

## What an entry holds

| Field | Meaning |
| --- | --- |
| `type` | One per entry, namespaced by the consumer (`sdd.decision`). It decides how `data` is read. |
| `tags` | Any number, namespaced, for filtering and grouping. |
| `author` | The participant who wrote it. |
| `body` | Markdown for people and agents to read. |
| `data` | A JSON object whose shape `type` defines. |
| `refs` | Reference shorthands (`gh:cyberuni/cynapse#12`), rendered as links when shown. |
| `parent`, `root` | The thread it belongs to. |

`--meta-only` reads headers without `body` and `data`, so an agent can scan a long ledger
cheaply before fetching the entries it needs.

## Reading less

A ledger grows. These options keep a read small:

- `--unread`: only entries after your cursor that you didn't write;
- `--after <seq>` and `--limit <n>`: page forward through it;
- `--from-summary`: start at the latest `cynapse.summary` entry;
- `--view <name>`: apply a saved [view](/cynapse/concepts/views/);
- `--type`, `--exclude-type`, `--tag`, `--exclude-tag`, `--author`, `--exclude-author`: filter.

There is no way to read backwards from the end, by time range, or by the text of a body.

## Related

- CLI: [`entry`](/cynapse/cli/entry/), [`tag`](/cynapse/cli/tag/)
- API: [`Store`](/cynapse/api/store/), [ids](/cynapse/api/ids/)
- Decisions: [ADR-0003](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0003-entry-identity-and-order.md),
  [ADR-0014](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0014-deleting-entries-and-channels.md)
