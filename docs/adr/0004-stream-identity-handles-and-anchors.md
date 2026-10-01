# ADR-0004: Streams: UUID identity, renameable handles, anchor entries

## Status

Accepted, 2026-09-30. Implemented in PR #16.

## Context

A stream is an ordered, append-only sequence of entries with one order owner. Its identity
is written into every entry and is the unit of partitioning and sync, so it must never
change. People and agents also need to name streams readably, and to rename them. Some
streams branch from a point in another stream, as an arbitration branches from the mission
entry that asked for it. Two agents opening "the same" stream at once must end up in one
stream, not two.

## Decision

- **Identity is a UUID that never changes.**
  - A stream branched from an anchor entry gets `UUIDv5(anchor entry id)`.
  - A stream with a natural key, such as a DM's canonical participant set, gets
    `UUIDv5(canonical key)`.
  - Any other stream gets a UUIDv7.

  Creating a stream whose derived ID already exists, with the same input, is a no-op.
  Creating it with a different handle, type, title, or traits fails with `id_conflict`.
- **A handle is readable, namespaced, and renameable.** Old handles stay as aliases, so
  shorthand references keep resolving.
- **A child stream attaches through an anchor entry in its parent.** The parent gets an
  entry (for example "arbitration needed", with a summary), and the child's `parent` is
  that entry. The outcome goes back into the parent as an entry that refers to the anchor.
- **The stream is the unit** of partitioning, sync, and access control.
- **Metadata is an agent's briefing in one call:** purpose, members with roles and cursors,
  context references, lifecycle and open state, pinned entries, the conventions that apply,
  and stats. Every change to it is also written as a `cynapse.*` entry in the stream.

## Considered options

- **A readable stream ID.** Rejected. Titles change and aren't unique. Slack
  (`C0123…` versus `#general`), Discord (a snowflake versus a name), and GitHub (a node ID
  versus `owner/name`) all separate the two.
- **Reusing the anchor's entry ID as the child stream's ID.** Rejected in favour of deriving
  it, so entry IDs and stream IDs stay separate namespaces.
- **A link type specific to missions.** Rejected. An anchor entry is generic and records
  *when* the branch happened.

## Consequences

- This is costly to change later: IDs are written into every entry.
- Links between streams form a tree through anchors. A many-to-many link isn't needed yet,
  because an arbitration lives under one mission.

## Related

- Evidence: SD02, SD09, SY21, SY22, LC08.
- Research rounds 6 and 7 in `changes.md`.
