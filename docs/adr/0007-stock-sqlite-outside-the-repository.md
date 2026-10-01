# ADR-0007: Stock SQLite outside the repository; the write transaction orders

## Status

Accepted, 2026-09-30. Implemented in PR #16.

## Context

cynapse runs first as a local CLI used by several agent processes on one machine, with no
setup and no daemon. It must later grow to several machines and to enterprise scale without
changing its data model. Two peers show the risks. mcp_agent_mail_rust corrupted databases
under a swarm of agents on a customized SQLite engine, while stock SQLite backups of the same
data verified clean (PR14, LC09). Beads abandoned JSONL committed to git in favour of Dolt
(PR03–PR05). And the Council's hypothesis HY01 holds that Markdown messages stored in a
repository cost agents context and cause confusion.

## Decision

- **The store is stock SQLite** (`node:sqlite`, WAL, a `busy_timeout`, short
  transactions), behind a `Store` interface. Never a modified engine.
- **SQLite's write transaction is the order owner on one machine.** Each write runs under
  `BEGIN IMMEDIATE` and assigns the stream's last `seq` + 1. There is no daemon.
- **The database lives outside any repository,** at `$CYNAPSE_HOME/cynapse.db` (default
  `~/.cynapse`). Agents read it through the CLI's budget flags (`--unread`, `--meta-only`,
  `--from-summary`), never through file search.
- **Raw conversation never goes into a repository.** Only distilled results do, as
  intended artifacts: an ADR through the `decision-record` route, or a summary per
  reconciled stream.
- **Beyond one machine, a hub owns `seq`,** and the stream is the unit of sync. The data
  model maps onto NATS JetStream (SY08–SY10). Dolt is a candidate for sync with no hub.
  Neither is adopted yet.

## Considered options

- **Beads or Dolt as the backend.** Rejected for now. Beads is an issue tracker and fits
  as a routing destination. Dolt has no Node bindings that we know of, and its leaderless merge conflicts
  with owner-assigned `seq`.
- **External platforms (Slack, Linear, Asana, GitHub) as the store.** Rejected. None
  supports ack or per-reader cursors, the rate limits are too low, and Telegram blocks
  bot-to-bot messages (BK09, BK12, BK16).
- **Git-backed storage (JSONL or Markdown in the repository).** Rejected, per beads'
  experience and HY01.

## Consequences

- The load test held with up to 32 concurrent writers: `seq` contiguous and unique, and
  `integrity_check` ok (LC10).
- There's no shared provenance with collaborators until the hub exists. Distilled
  artifacts in the repository cover the durable part.
- HY01 is untested. `evidence.md` defines the two-copy test that would confirm or weaken
  "raw conversation never goes into a repository".
- SDD's raw combat log (`.agents/plans/*.log.jsonl`) is a candidate to move onto a cynapse
  stream.

## Related

- Evidence: PR03–PR05, PR14, LC09, LC10, HY01, SY08–SY10, BK09, BK12, BK16.
- Research rounds 8 and 9 in `changes.md`.
