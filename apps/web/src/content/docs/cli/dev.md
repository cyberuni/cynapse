---
title: dev
description: Development tools — an example world to explore and a concurrent-writer load test.
---

The `dev` commands exist for working on cynapse and for trying it out. Neither is meant for a store
you care about.

## `cynapse dev seed`

Build an example world in the database: an SDD work hierarchy and mission graph, a cyber-truss mission
with two arbitration rounds, agent coordination with a lease, a change feed, and a direct-message
channel — with unread entries and open `needs-input` records waiting for the `council` participant.
Timestamps come from a fixed clock starting 2026-09-21, so the world is the same every time.

The command refuses to touch a database that already has channels: it fails with exit `1` unless you
pass `--reset`. `--reset` deletes the database file (and its `-wal` and `-shm` companions) first,
so it needs an explicit `--db`: without one it fails with exit `2` and leaves your real database at
`$CYNAPSE_HOME/cynapse.db` untouched.

:::caution
`dev seed` with no `--db` still writes to your real database at `$CYNAPSE_HOME/cynapse.db`. Pass
`--db` to a scratch file.
:::

**Usage**

```bash
cynapse --db <path> dev seed [--reset]
```

| Option | Effect |
| --- | --- |
| `--reset` | Delete the database first. Requires `--db`. |

**Examples**

```bash
cynapse --db /tmp/demo.db dev seed
```

```text
seeded /tmp/demo.db
13 channels, 185 entries, 15 participants
council: 76 unread, 2 open needs-input
  init-agent-comms  sdd.initiative  active  9 entries
  epic-store  sdd.epic  active  8 entries
  epic-viewer  sdd.epic  active  5 entries
  m-seq-order  sdd.mission  reconciled  29 entries
  m-channel-ids  sdd.mission  active  12 entries
  m-cortex-shell  sdd.mission  active  7 entries
  graph-agent-comms  sdd.mission-graph  active  31 entries
  truss-pagination  truss.mission  active  25 entries
  truss-pagination-arb-1  truss.arbitration  closed  15 entries
  truss-pagination-arb-2  truss.arbitration  escalated  16 entries
  coord-cynapse  coord.channel  active  13 entries
  feed-cynapse  feed.changes  active  11 entries
  dm-council-conductor  cynapse.dm  active  4 entries
```

Then explore as the Council:

```bash
cynapse --db /tmp/demo.db --as council unread
cynapse --db /tmp/demo.db --as council channel show truss-pagination
cynapse --db /tmp/demo.db state list --status open
cynapse --db /tmp/demo.db gui --no-open
```

The seed participants include `council` (human), `sdd-conductor`, `sdd-spec-judge`, `operator`,
`pod-store` and `pod-viewer`.

## `cynapse dev load-test`

Check that `seq` stays correct under concurrent writers. It spawns separate writer processes that all
append to one channel, then verifies that the `seq` values are contiguous and unique, that each
writer's own entries stayed in order, and that SQLite's `integrity_check` is `ok`. It exits `1`
(`load test failed its checks`) if any check fails.

Without `--db` it uses a fresh temporary file, never your real store, and prints its path.

**Usage**

```bash
cynapse dev load-test [--writers <n>] [--entries <n>]
```

| Option | Effect |
| --- | --- |
| `--writers <n>` | Concurrent writer processes. Default `12`. |
| `--entries <n>` | Entries each writer appends. Default `200`. |

**Examples**

```bash
cynapse dev load-test --writers 3 --entries 20
```

```text
3 writers × 20 entries = 60 in 125.85 ms (476.75/s)
append latency ms: p50 0.25, p95 1.05, p99 19.68, max 19.68
seq contiguous: true, unique: true, per-writer order kept: true
integrity_check: ok
db: /tmp/cynapse-load-Rb3VWZ/load.db
```

Timings vary by machine. See [Storage](/cynapse/concepts/storage/) for how `seq` is assigned under
`BEGIN IMMEDIATE`.

:::note
A hidden `dev load-worker` subcommand is what each writer process runs; it is internal and not
documented as part of the CLI.
:::
