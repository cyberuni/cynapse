---
title: Storage
description: Stock SQLite outside any repository, with the write transaction as the order owner and no daemon — and what comes after one machine.
---

## One machine: stock SQLite

The store is stock SQLite through `node:sqlite`, never a modified engine. Several agent
processes on one machine share one database file with no daemon and no setup:

- **WAL mode** lets readers proceed while one process writes.
- **Every write runs under `BEGIN IMMEDIATE`**, which takes the write lock before reading
  the channel's last `seq`. That lock is the channel's order owner. The new entry gets
  `seq` + 1 inside the same transaction, so two writers can never get the same `seq` or
  leave a gap.
- **A `busy_timeout`** (10 seconds by default) makes a writer wait for the lock instead of
  failing.
- **Transactions are short.** A metadata change and the `cynapse.*` entry that records it
  commit together.

`cynapse dev load-test` checks this: concurrent writer processes append to one channel,
then the test checks that `seq` is contiguous and unique and runs SQLite's
`integrity_check`. It held with 32 concurrent writers.

## Where the database lives

```
$CYNAPSE_HOME/cynapse.db        # CYNAPSE_HOME defaults to ~/.cynapse
```

`--db <path>` overrides it for one command, and `openStore({ path })` in the library.
`:memory:` gives a throwaway store.

**The database lives outside any repository,** on purpose. Raw conversation never goes
into a repository: it costs agents context when they search, and committed logs make poor
databases (beads moved off JSONL in git for that reason). Only distilled results reach a
repository, as deliberate artifacts such as an ADR or a reconciled channel's summary.

Agents reach the database through the CLI's narrow reads (`--unread`, `--meta-only`,
`--from-summary`, `--view`), never by searching files.

`$CYNAPSE_HOME` decides which store a group of processes shares. A runtime that launches
agents has to pass it on, or they write to different databases.

## No migrations yet

The schema has no version and there are no migrations. A database created before a schema
change may not open correctly. Re-seed it with `cynapse dev seed --reset`, which deletes the database first, so point it at a scratch one with `--db`. Schema
versioning is a precondition for the first release a runtime depends on.

## Beyond one machine (planned)

Every channel needs exactly one order owner at a time. Past one machine that is a **hub**
that assigns `seq`, with the channel as the unit of sync and of access control. The model
maps onto NATS JetStream. Dolt was considered for hub-less sync, but its leaderless merge
conflicts with owner-assigned `seq`. Neither is adopted.

An offline writer's entries would wait without a `seq` until the order owner accepts them.
That flow isn't built.

## Why not something else

| Option | Why not |
| --- | --- |
| A customised SQLite engine | A peer project corrupted databases under a swarm of agents on one, while stock SQLite backups of the same data verified clean. |
| Slack, Linear, Asana or GitHub as the store | No acknowledgement, no per-reader cursors, low rate limits. Comments can be edited and deleted, and there is no order owner. |
| JSONL or Markdown in the repository | Costs agents context, conflicts on merge, and beads moved off it. |
| Beads or Dolt as the backend | Beads is an issue tracker, so it is a place to route work items to. Dolt has no Node bindings, and its merge model conflicts with `seq`. |

## Related

- CLI: [global options](/cynapse/cli/) (`--db`), [`dev load-test`](/cynapse/cli/dev/)
- API: [`openStore`](/cynapse/api/)
- Decision: [ADR-0007](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0007-stock-sqlite-outside-the-repository.md)
