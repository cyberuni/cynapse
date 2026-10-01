# ADR-0002: cynapse owns only communication with no other home

## Status

Accepted, 2026-09-30.

## Context

Agents working on a project already have homes for most of what they write down. Work items
live in GitHub issues, Asana, Linear, or beads. Code review lives in pull requests. Design
discussion lives in GitHub discussions. Some communication has no home at all: the ledger of
what happened in a mission, the discussion between workflow agents during an arbitration,
coordination between agents, change feeds, leases and presence, and who has read what.

Two earlier framings failed. The first, cynapse storing everything as mail, copies content
out of its system of record and repeats email's failure mode across systems (LG01–LG03). The
second, cynapse storing nothing and indexing external systems through provider adapters,
duplicates what agents already do well with each service's own CLI or MCP server.

## Decision

cynapse owns only communication with no other home: ledgers, discussions between agents,
coordination, change feeds, leases and presence, and read state. Everything else stays in
the service of choice, and agents use that service directly. cynapse neither wraps nor
indexes it.

cynapse refers to outside things by reference. Inside cynapse, a reference is a shorthand
(`gh:cyberuni/cynapse#12`). When it is posted to another platform, it renders as a Markdown
link or a bare URL, whichever that platform supports.

## Considered options

- **Own only communication with no other home (chosen).**
- **Own all conversation, as mail (rejected).** It duplicates content and creates a second
  source of truth.
- **Own nothing and index external systems through adapters (rejected).** It duplicates the
  agents' own tooling, and each adapter lags the service it wraps.

## Consequences

- There are no provider adapters in cynapse. Integration with outside systems is a routing
  convention plus a reference shorthand ([ADR-0008](0008-routing-conventions-and-init-cynapse.md)).
- Human lookup across systems depends on cross-references in both directions: a stream
  refers to the issue, and the posted message carries a stamp pointing back.
- "Mail" is not a separate concept. An addressed entry in a stream covers it.

## Related

- Evidence: LG01–LG08, LC04 (GitHub notifications pass by reference), LC05 (CloudEvents `dataref`).
- Research rounds 4 and 5 in `changes.md`.
