---
title: State and lifecycle
description: "State records for what is true now (needs-input, pending answers) and a channel's lifecycle, where cleanup is a state and deleting a channel is a reserved one."
---

A channel's entries say what happened. Some facts are about what is true **now**: a
question is waiting on someone, an answer is pending, a file is leased, a ledger has been
reconciled. A log alone can't answer "what is still open" cheaply, and can't enforce
expiry or mutual exclusion. Those facts are **state records**.

## State records

A state record is keyed per channel and holds one current fact:

| Field | Meaning |
| --- | --- |
| `key` | Unique within the channel, such as `cursor-rule` |
| `kind` | Consumer-defined, such as `sdd.needs-input`, `truss.pending-answer` |
| `status` | `open` or `resolved` |
| `subject` | The participant it waits on or is held by |
| `entryId` | The entry it is about, if any |
| `value` | Any JSON |

```bash
cynapse state set review-12 cursor-rule --kind demo.needs-input --status open --subject carol
cynapse state list --status open --subject carol      # what is waiting on carol
cynapse state set review-12 cursor-rule --kind demo.needs-input --status resolved
```

**Every transition is also written as an entry** (`cynapse.state.changed`, with `from` and
`to`), so the record says what is true now and the channel says how it got there. Open
records appear in the channel's [briefing](/cynapse/concepts/channels/#the-briefing).

Nothing resolves a record automatically. A reply isn't always an answer, so whoever
answers or gives up resolves it.

**`state set` has no condition.** Two writers setting the same key both succeed, and the
later write wins:

```console
$ cynapse --as alice state set f lock-1 --kind demo.lease --status open --subject alice
f  lock-1  demo.lease  open → alice
$ cynapse --as bob state set f lock-1 --kind demo.lease --status open --subject bob
f  lock-1  demo.lease  open → bob
```

So a state record can't serve as a lock. For a write that may happen only once, such as a
single ruling on a decision, use the library's `appendUnless`, which checks for a matching
entry in the same transaction that writes
([Store](/cynapse/api/store/#appendunlessref-input-unless)).

## Lifecycle

A channel has one lifecycle state: `active` by default, and otherwise any string its
consumer uses. The seed uses `paused`, `closed`, `escalated` and `reconciled`.

```bash
cynapse state lifecycle review-12 reconciled
cynapse channel list --state reconciled
```

A lifecycle change is written as a `cynapse.state.changed` entry. It is set with
`state lifecycle`, not `state set`.

### Cleanup is a state, not a deletion

When a mission ends, its raw ledger has done its job, but the distilled record has to
survive, and the distilled record is a [view](/cynapse/concepts/views/) over the raw
channel. So cleanup marks the channel `reconciled` and doesn't delete it.

### Deleting a channel

Deleting is for removing what was said, such as a secret pasted into a channel, or a
channel nobody wants any more ([ADR-0014](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0014-deleting-entries-and-channels.md)).
It was added after 0.1.0.
`deleteChannel` erases every entry outside `cynapse.*`, leaving
[tombstones](/cynapse/concepts/entries/#deleting-an-entry), and moves the channel to the
reserved lifecycle state `deleted`, logged as one `cynapse.channel.deleted` entry.

```bash
cynapse --as alice channel delete review-12
cynapse channel list --include-deleted
```

- The channel keeps its id, handles and subject keys, so references still resolve.
  Creating it again from its subject returns it, still deleted.
- `listChannels` and `tree` hide it, unless asked with `includeDeleted` or `state: 'deleted'`.
- `state lifecycle <channel> active` restores it, empty except for its `cynapse.*` history.
- Child channels anchored in it are left alone; their anchor entries resolve as tombstones.
- `setLifecycle` refuses `deleted`, so a channel is never marked deleted with its content still there.
- Open state records on the channel stay open. Resolve them yourself if they no longer apply.

What the design adds on top, not built yet:

- marking a channel `reconciled` makes its distilled view the default;
- physically removing raw entries is an optional retention step. If it is ever taken, the
  channel records the `seq` ranges it removed, so a reader can tell "not received yet" from
  "removed on purpose".

## Leases (planned)

Leases are designed and not built: state records with a time to live, an exclusive flag,
path patterns, a release time, and a way to repair orphaned leases
([ADR-0006](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0006-state-views-and-lifecycle.md)).
Until they exist, nothing expires and nothing is exclusive. Leases are for coordination,
such as who holds a task or a file. They are not how a session's liveness is tracked: a
runtime asserts that itself
([cynapse and the runtime](/cynapse/design/runtime/#why-the-line-falls-there)).

## Related

- CLI: [`state`](/cynapse/cli/state/)
- API: [`StateRecord`](/cynapse/api/types/), [`Store.setState`](/cynapse/api/store/)
- Decision: [ADR-0006](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0006-state-views-and-lifecycle.md)
