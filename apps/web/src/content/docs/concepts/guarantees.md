---
title: Guarantees and limits
description: "What cynapse promises about ordering, idempotency, atomicity, concurrency, durability, delivery and change notification, what happens on failure, and what it deliberately doesn't do."
---

cynapse is a storage layer that other tools build on, like a database. This page states
what it promises, and where each promise stops. Everything here describes the SQLite store
on one machine, which is the only store that exists.

## Ordering

- **Each channel has one total order: `seq`.** The first entry is `1`, and each new entry
  gets the channel's last `seq` + 1, assigned while the store's write lock is held. Two
  writers never get the same `seq`, and no `seq` is skipped.
- **`seq` is arrival order,** not creation order. `createdAt` comes from the writer's
  clock; `recordedAt` is when the entry arrived.
- **A deleted entry keeps its `seq`** as a tombstone, so the sequence still has no gaps
  ([Deletion](#deletion)).
- **There is no order across channels.** `search`, which reads several channels, sorts by
  entry id, which is the writer's clock for a minted id. The [change token](#change-notification)
  is not an order of entries either.

## Idempotency

| Operation | Repeating it |
| --- | --- |
| Append with an `id` | Same `id` and same payload returns the stored entry. A different payload fails with `id_conflict`. |
| Append without an `id` | Writes a new entry every time. A retry after an unknown outcome can write twice. |
| Create a channel from a subject, anchor or key | Returns the existing channel ([Channels](/cynapse/concepts/channels/#identity)). |
| Create a channel with only a handle | Fails, because the handle is taken. |
| Register a participant | A live key returns the existing participant. The same key with another kind fails with `id_conflict`. |
| `appendUnless` | Writes only if no entry matches the condition, checked inside the write. Of two racing writers, at most one lands. |
| Delete an entry or a channel | With nothing new to erase, returns the entry that logged the delete. |
| Move a cursor | Never moves it backwards. |
| `state set` | Always writes. The later write wins. |

To make an append safe to retry, choose its `id` before the first attempt, for example
with `uuidgen`, and pass the same `id` on every retry.

## Atomicity

- **Each store call is one transaction.** It commits whole or not at all.
- **A metadata change and the `cynapse.*` entry that records it commit together.** A
  channel's log never disagrees with its current state.
- Registering a participant creates the participant, its address channel and the
  `cynapse.participant.registered` entry in one transaction.
- **A CLI command can make several calls.** `channel create --member … --context …` creates
  the channel, then adds each member and each context reference in separate transactions.
  `tag` with tags to add and `--remove` writes twice. If the process stops in between, the
  earlier calls stay.

## Concurrency

- **Many processes on one machine can use one store at once,** with no daemon. The load
  test holds `seq` unique and gap-free with 32 concurrent writer processes.
- **There is one write lock per store, not per channel.** Writes to any channels take turns.
  Each write is short, so the turns are short.
- **A writer waits up to 10 seconds for the lock,** then fails with
  `database is locked` (exit `1`, code `failure`). Retry it.
- **A reader doesn't wait for writers.** Opening a current store reads its schema version
  without a lock. Only the first open after an upgrade, which migrates the schema, takes
  the write lock and can wait behind a writer.
- **The file must be on a local filesystem, used by processes on one host.** SQLite's
  write-ahead log needs shared memory between them. A network filesystem isn't supported.

## Durability

- **A committed write survives a crash of the process** that made it.
- **A power loss or an operating system crash can lose the latest commits.** The store runs
  with `synchronous = NORMAL`. The file stays consistent; it rolls back to an earlier
  commit.
- **Nothing expires.** Entries, tombstones, cursors and state records stay until you delete
  them. The file grows ([Storage](/cynapse/concepts/storage/#growth)).
- **A database opens in every later release.** Opening it migrates the schema forward in
  one transaction. A database from a newer cynapse is refused with `schema_too_new` and not
  written to. There are no backward migrations.

## Delivery

cynapse is pull-only. Nothing is pushed to a reader, and nothing is redelivered on a timer.

- **A cursor is a high-water mark per participant per channel.** Everything at or below it
  counts as read. It never moves backwards.
- **Entries you wrote are never unread for you.**
- **At-least-once processing is the reader's pattern:** list unread entries, act on them,
  then `read --to <seq>` with the last one you processed. A reader that stops before
  `read` sees the same entries next time ([Read state](/cynapse/concepts/read-state/#reading-without-missing-an-entry)).
- **`read` without `--to` can skip entries.** It moves the cursor to the latest entry,
  including entries that arrived after you listed.
- **There is no per-entry acknowledgement** on a work channel, and no way to leave one entry
  unread while reading the next. On an address channel, the owner's `cynapse.handled` tag
  records per message that it was dealt with.
- **There are no competing consumers.** Every reader sees every entry; cynapse doesn't hand
  an entry to exactly one of several workers.

## Change notification

- **`changes(since)` returns every channel that received an entry since the token,** and a
  new token. Every append moves it, `cynapse.*` entries included. Moving a cursor doesn't.
- **No change is lost between polls.** A channel that moves while `changes` runs shows up
  in the next poll.
- **The token is opaque and belongs to one store.** A token from another store fails with
  `foreign_token`, and a malformed one with `invalid_token`. Don't compare or sort tokens.
- **The first call, without a token, returns every channel.**
- **Nothing wakes a reader.** `entry wait` polls every 500 ms in the caller's own process.
  A runtime decides whom to wake from what `changes` returns.

## Deletion

- **A delete erases an entry's body, data, refs and tags in the database,** and leaves a
  tombstone that keeps its `id`, `seq`, author, type and thread. Reads hide tombstones
  unless asked.
- **The erased bytes can stay on disk for a while.** SQLite doesn't overwrite freed space,
  so the old content can remain in the write-ahead log and in free pages of the file until
  they are reused. Treat a delete as removing content from every read, not as wiping the
  disk. Running `VACUUM` with no cynapse process open rewrites the file without free pages.
- **`cynapse.*` entries can't be deleted.** Content written into them stays, such as a
  state record's `value` or a channel's title and purpose.

## Identity

cynapse records the participant that each call names, with `--as`,
`$CYNAPSE_PARTICIPANT` or an `author` field, and doesn't verify it. A name it hasn't seen
becomes a new participant. A participant's `kind` and `status` are what the registering
runtime said. The one rule that depends on the caller, that only an address channel's owner
may set `cynapse.handled`, keeps one owner's triage set consistent. It doesn't prove who
the caller is.

## Failure modes

| What happens | What you see | What to do |
| --- | --- | --- |
| Another process holds the write lock for over 10 seconds | `database is locked`, exit `1`, code `failure` | Retry. |
| The database was written by a newer cynapse | `schema_too_new`, exit `1` | Upgrade cynapse. |
| The process stops in the middle of a call | The call's transaction rolls back | Retry; pass an `id` to make an append safe to retry. |
| The process stops between two calls of one CLI command | The earlier calls stay | Rerun the command, or finish it with single calls. |
| The disk is full, or the file is damaged | SQLite's own message, exit `1`, code `failure` | Free space, or restore a backup. |
| A name matches no live participant, or several | `unknown_address` (exit `5`) or `ambiguous_address` (exit `4`) | Fix the name, or pass an id. |
| `entry wait` sees no reply in time | `timeout`, exit `3` | Wait again. |

Every CLI error prints a `help:` line with a next step. Errors that cynapse doesn't raise
itself, such as a locked database or a full disk, get a generic help line that suggests
reporting a bug.

## What cynapse doesn't do

- **It doesn't push, subscribe or wake anyone.** Readers poll.
- **It doesn't sync between machines.** One store is one SQLite file. A hub that assigns
  `seq` across machines is designed, not built.
- **It doesn't verify identity,** as above.
- **It doesn't call other systems.** It holds no credentials for GitHub, Asana or anything
  else; references to them are strings.
- **It doesn't expire anything.** There are no leases, time-to-live values or retention
  rules yet.
- **It doesn't edit entries.** A correction is a new entry ([#62](https://github.com/cyberuni/cynapse/issues/62)
  proposes edits).
- **It doesn't search text.** Filters match type, tag, author and position, not the body.

## Related

- [Storage](/cynapse/concepts/storage/): the file, the SQLite settings, backups.
- [Read state](/cynapse/concepts/read-state/): cursors and unread.
- [Public contract](/cynapse/public-contract/): what a release promises not to change.
