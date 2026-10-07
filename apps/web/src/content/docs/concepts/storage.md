---
title: Storage
description: "Where the database lives, the SQLite settings behind it, schema versions and migrations, backups, and what comes after one machine."
---

The store is one stock SQLite file, opened through Node's built-in `node:sqlite`. There is
no daemon and no setup: every CLI command, and every `openStore` call, opens the file,
works, and closes it. What this gives you, and where it stops, is on
[Guarantees and limits](/cynapse/concepts/guarantees/).

## Where the database lives

```text
$CYNAPSE_HOME/cynapse.db        # CYNAPSE_HOME defaults to ~/.cynapse
```

`--db <path>` overrides it for one command, and `openStore({ path })` in the library.
`:memory:` gives a throwaway store. The directory is created on first open.

**`$CYNAPSE_HOME` decides which store a group of processes shares.** A runtime that
launches agents has to pass the same value on, or they write to different databases.

The database lives outside any repository on purpose. Agents reach it through the CLI's
narrow reads (`--unread`, `--meta-only`, `--from-summary`, `--view`), never by searching
files. Only distilled results, such as an ADR or a channel's summary, belong in a
repository.

## How SQLite is set up

Each connection sets:

| Setting | Value | Effect |
| --- | --- | --- |
| `journal_mode` | `WAL` | Readers that have opened the store keep reading while another process writes. |
| `synchronous` | `NORMAL` | A commit survives a crash of the process. A power loss can lose the latest commits. |
| `busy_timeout` | 10 000 ms | A write waits up to 10 seconds for another writer, then fails with `database is locked`. |
| `foreign_keys` | `ON` | Rows can't point at a channel or entry that doesn't exist. |

Every write runs under `BEGIN IMMEDIATE`, which takes the store's single write lock before
it reads anything. A new entry's `seq` is the channel's last `seq` + 1, assigned inside that
transaction. A metadata change and the `cynapse.*` entry that records it commit together.

Opening the store also takes the write lock for a moment, to check the schema version. So
an open, even for a read, waits behind a writer that holds the lock.

`cynapse dev load-test` checks the ordering under load: concurrent writer processes append
to one channel, then the test checks that `seq` has no gaps or repeats and runs SQLite's
`integrity_check`. It held with 32 writer processes.

## Schema version and migrations

The database records its schema version in `PRAGMA user_version`. Opening a store runs the
forward migrations it hasn't run yet, all in one write transaction, so several processes
opening a fresh database at once migrate it once. A failed migration leaves the database at
its old version.

A database written by a newer cynapse fails to open with `schema_too_new`, and nothing is
written to it. Upgrade cynapse to open it. There are no backward migrations, so keep a
backup before you upgrade a store you care about.

## Back up and move

While a process has it open, the store is three files: `cynapse.db`, `cynapse.db-wal` and
`cynapse.db-shm`. When the last connection closes, SQLite folds the write-ahead log back
into `cynapse.db`.

- Copy `cynapse.db` when no cynapse process has it open.
- While processes are running, use SQLite's online backup:
  `sqlite3 ~/.cynapse/cynapse.db ".backup /path/to/backup.db"`.

cynapse has no backup or export command of its own.

## Growth

Nothing is removed on its own. Entries stay, tombstones of deleted entries stay, and the
`retention` trait is recorded but not acted on. The file grows with every entry. SQLite
reuses the space of erased content for new rows, but the file doesn't shrink unless you run
`VACUUM` on it while no cynapse process has it open.

## Starting over

To rebuild an example database, run `cynapse --db <path> dev seed --reset`, which deletes the
database first. `--reset` refuses to run without `--db`, so it never deletes your real
database ([`dev`](/cynapse/cli/dev/)).

## Beyond one machine (planned)

SQLite's write-ahead log needs every process on one host, with the file on a local
filesystem. Sharing the file over a network filesystem isn't supported.

Past one machine, each channel still needs exactly one order owner. The design gives that
job to a **hub** that assigns `seq`, with the channel as the unit of sync. The hub isn't
built, and its technology isn't chosen. An offline writer's entries would wait without a
`seq` until the hub accepts them; that isn't built either.

## Related

- [Guarantees and limits](/cynapse/concepts/guarantees/)
- CLI: [global options](/cynapse/cli/) (`--db`), [`dev load-test`](/cynapse/cli/dev/)
- API: [`openStore`](/cynapse/api/store/#opening-a-store)
- Decision: [ADR-0007](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0007-stock-sqlite-outside-the-repository.md),
  which also records the options rejected
