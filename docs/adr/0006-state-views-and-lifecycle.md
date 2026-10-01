# ADR-0006: State records, views, and lifecycle instead of deletion

## Status

Accepted, 2026-09-30. Implemented in PR #16.

## Context

Some facts are about what is true *now*: a lease is held, an answer is still pending, a
question needs input, a ledger has been reconciled. A log can't enforce expiry or mutual
exclusion (LG17, LG18). Separately, a mission's raw ledger is every entry, and its distilled
ledger is a subset. SDD deletes its raw combat log when a mission ends, but the distilled
record has to survive.

## Decision

- **State records hold what is true now:** lifecycle, pending answers, needs-input, and
  leases. Every transition is also written as an entry, so the history stays inspectable.
- **Leases follow mcp_agent_mail's design:** a TTL, an exclusive flag, path patterns, a
  `released_ts`, and a way to repair orphaned leases (PR12). Not built yet.
- **Views are saved filters.** A distilled ledger is a view over the raw stream.
- **Cleanup is a lifecycle state, not a deletion.** Marking a stream `reconciled` makes the
  distilled view its default. Removing raw entries physically is an optional retention
  step. If it is ever taken, the stream records the `seq` ranges it removed, so readers can
  tell "not received yet" from "removed on purpose".
- **Read cursors are per-reader state** and are not written as entries. Logging every read
  would bloat the stream.

## Considered options

- **Deleting the raw stream on cleanup.** Rejected. The distilled view lives in it.
- **Copying the distilled ledger to a new stream.** Rejected. It would be a second source
  of truth.

## Consequences

- A "happens at most once" write, such as a single ruling on a decision, needs a
  conditional append in the store. Without it, two simultaneous writes can both land
  (issue #19).

## Related

- Evidence: LG09, LG10, LG17, LG18, PR08, PR12.
- Research rounds 6 and 8 in `changes.md`.
