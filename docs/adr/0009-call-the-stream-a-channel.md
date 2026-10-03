# ADR-0009: Call the stream a channel

## Status

Accepted, 2026-10-03. Renames the term used in ADR-0001 through ADR-0008; it changes no
decision in them.

## Context

ADRs 0003 to 0008 call cynapse's core primitive a *stream*: an ordered, append-only
sequence of immutable entries with one order owner. In everyday reading, "stream" suggests
data flowing one way between two endpoints. A cynapse stream is the opposite: many
participants write to it and read from it, in both directions. Kafka, NATS JetStream and
Redis use "stream" for a log with many producers and consumers, but readers of a messaging
layer don't come to it with that meaning. Zulip used "stream" for the same idea and has
since moved to "channel" (LG15).

The prototype has no consumers yet. The term is in the CLI, the `Store` interface, the
SQLite tables and the `cynapse.*` entry types, so the cost of renaming rises once SDD or
cyber-truss start writing entries.

## Decision

The primitive is a **channel**. The rename covers the code, the CLI (`cynapse channel`,
`--channel`), the `Store` interface, the SQLite schema (`channels`, `channel_handles`,
and `channel` columns), the `cynapse.channel.*` entry types, Cortex, and the docs.

ADRs 0001 to 0008 keep "stream", because an accepted ADR is superseded, never rewritten.
Read "stream" in them as "channel". `JetStream` and `Litestream` are product names and
keep theirs.

## Considered options

- **Channel (chosen).** Slack, Discord and Zulip all use it for a two-way conversation
  with many members. Go and CSP use it for a one-way pipe, but that meaning belongs to
  programming languages, not to messaging products.
- **Conversation** (Slack's API term). It fits a ledger badly and is long for a CLI.
- **Keep stream.** This keeps the cost at zero, but the wrong meaning grows with every
  consumer.

## Consequences

- A database created before the rename does not open correctly, because its tables keep
  the old names. No migration is provided: the schema has no version, and no database
  exists outside development. Re-seed with `cynapse dev seed`.
- A consumer type may still contain the word, as the seed's `coord.channel` does. It is a
  consumer name, not a cynapse term.

## Related

- Evidence: LG15.
- Research round 10 in `changes.md`.
