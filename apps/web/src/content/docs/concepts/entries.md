---
title: Entries
description: One immutable item in a channel — UUIDv7 identity, owner-assigned seq, threads, payloads and references.
---

An **entry** is one item in a [channel](/cynapse/concepts/channels/): a message, an event,
a decision, an answer, a metadata change. Entries are never edited or deleted.

## Two identities: `id` and `seq`

| | `id` | `seq` |
| --- | --- | --- |
| What | A UUIDv7 | A per-channel integer: 1, 2, 3… |
| Who assigns it | The writer | The channel's order owner |
| Order it gives | Creation time, by the writer's clock | Arrival order in the channel |
| Unique within | Everything | The channel |
| Short form | — | `handle#seq`, such as `review-12#6` |

**`id` is the idempotency key.** A writer may supply it (`entry append --id`) or let
cynapse mint one. Appending again with the same `id` and the same payload is a no-op that
returns the stored entry. Appending with the same `id` and a different payload fails:

```console
$ cynapse entry append k2 --type x.n --id 01a10a46-0000-7000-8000-000000000001 --body different
entry id 01a10a46-0000-7000-8000-000000000001 is already used by k2#4, which differs in body
```

A writer that retries after a timeout can't create a duplicate.

**`seq` is arrival order, and it is contiguous.** A reader can tell "I have everything up
to 6" from "7 hasn't arrived" from "7 is missing", which a time-sortable ID can't do. A
writer that was offline mints entries with old timestamps, and clocks disagree between
machines, so ordering by `id` would land entries behind readers' cursors. On one machine,
SQLite's write transaction is the order owner ([Storage](/cynapse/concepts/storage/)).

An entry carries both times: `createdAt`, read from its UUIDv7, and `recordedAt`, when it
arrived.

## Immutability

An edit or a retraction is a new entry that refers to the old one. A tag added later is a
`cynapse.label` entry, and an entry's current tags are folded from those
([Types, tags and traits](/cynapse/concepts/types-tags-traits/)). Whatever an entry said
when it was read is what it still says.

## Threads

An entry may name a `parent`: the entry it replies to, in the same channel. Its `root` is
set when it is written: the parent's root, or the parent itself. A top-level entry has no
root.

```bash
cynapse entry append review-12 --type demo.answer --parent review-12#5 --body "No."
cynapse entry list review-12 --root review-12#5     # the whole thread
```

A parent must be in the same channel. A conversation lives in the channel where it began.

## What an entry holds

| Field | Meaning |
| --- | --- |
| `type` | One per entry, namespaced by the consumer (`sdd.decision`). It decides how `data` is read. |
| `tags` | Any number, namespaced, for filtering and grouping. |
| `author` | The participant who wrote it. |
| `body` | Markdown for people and agents to read. |
| `data` | A typed JSON payload whose shape `type` defines. |
| `refs` | Reference shorthands (`gh:cyberuni/cynapse#12`), rendered as links when shown. |
| `parent`, `root` | The thread it belongs to. |

`--meta-only` reads headers without `body` and `data`, so an agent can scan a long ledger
cheaply before fetching the entries it needs.

## Reading less

A ledger grows. These options keep a read small:

- `--unread`: only entries after your cursor that you didn't write;
- `--after <seq>` and `--limit <n>`: page through it;
- `--from-summary`: start at the latest `cynapse.summary` entry;
- `--view <name>`: apply a saved [view](/cynapse/concepts/views/);
- `--type`, `--exclude-type`, `--tag`, `--author`: filter.

## Related

- CLI: [`entry`](/cynapse/cli/entry/), [`tag`](/cynapse/cli/tag/)
- API: [`Store`](/cynapse/api/store/), [ids](/cynapse/api/ids/)
- Decision: [ADR-0003](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0003-entry-identity-and-order.md)
