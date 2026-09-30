# ADR-0003: Entries: UUIDv7 identity, owner-assigned `seq`, immutable

## Status

Accepted, 2026-09-30. Implemented in PR #16.

## Context

An entry is one item in a stream: a message, an event, an answer. Entries must have an
identity that is stable across machines and retries, and an order that read cursors, gap
detection, and human inspection can rely on. Writers may be offline, and their clocks may
disagree.

## Decision

- **`id` is a UUIDv7 minted by the writer.** It is the entry's global identity and its
  idempotency key. A retry with the same `id` and the same payload returns the stored entry.
  A retry with the same `id` and a different payload fails with `id_conflict`.
- **`seq` is a per-stream integer assigned by the stream's order owner.** It is arrival
  order, not creation order. The pair (stream, `seq`) is unique. The short reference for an
  entry is `handle#seq`.
- **Entries are immutable.** An edit or a retraction is a new entry that refers to the old
  one. A tag added later is a label entry ([ADR-0005](0005-consumer-defined-types-tags-and-traits.md)).
- **Reply tree:** an entry may name a `parent`. Its `root` is set at write time. A top-level
  entry has no `root`.

## Considered options

- **ULID instead of UUIDv7.** Both sort by millisecond creation time. UUIDv7 is the IETF
  standard (RFC 9562) and is native in Postgres 18 and in most tooling. ULID's shorter
  string is a presentation concern, and `handle#seq` covers it.
- **No `seq`; order by the time-sortable ID.** Rejected. An offline writer's entries carry
  old timestamps and would land behind readers' cursors. Clocks disagree between machines.
  Only a contiguous sequence reveals a gap (Telegram `pts`, TR03). A UUIDv7 can't be
  shortened by prefix either, because the prefix is the timestamp.
- **Leaderless merge (Lamport clocks, CRDTs).** Rejected for the default. It gives only
  causal order. SDD's per-writer ledger shows that trade: no merge conflicts, and no order
  (LC02).

## Consequences

- This is costly to change later. Every reference and every cursor depends on the ID shape
  and on `seq`.
- Every stream needs exactly one order owner at a time: SQLite's write transaction on one
  machine ([ADR-0007](0007-stock-sqlite-outside-the-repository.md)), and the hub beyond one
  machine.
- An offline writer's entries wait without a `seq` until the order owner accepts them. That
  flow isn't built yet.

## Related

- Evidence: LG04–LG08, SY02, SY08, SY21, SY22, TR03, LC02, LC10.
- Research round 6 in `changes.md`.
