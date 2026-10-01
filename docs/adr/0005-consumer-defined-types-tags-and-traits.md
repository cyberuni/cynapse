# ADR-0005: Types and tags are namespaced and defined by consumers

## Status

Accepted, 2026-09-30. Implemented in PR #16.

## Context

cynapse's first consumers are SDD (missions, gates, strategy) and cyber-truss (workflows,
contributions, arbitration), but those are examples. Other consumers will bring concepts of
their own. One stream mixes conversation with structured events such as decisions and gate
verdicts. Matrix, GitHub's issue timeline, and Zulip topics do the same (LG11, LG13, LG15).

## Decision

- **Stream types and entry types are namespaced and defined by consumers**, for example
  `sdd.mission`, `truss.arbitration`, `truss.answer.agree`. cynapse reserves `cynapse.*`
  for its own metadata entries.
- **cynapse defines only generic stream traits:** membership (open or fixed), retention
  class, lifecycle states, whether members are woken, and the default view. A consumer's
  type picks its traits.
- **Each entry has one type,** which decides how its payload is read, **and any number of
  namespaced tags,** which are for filtering and grouping. A tag added after the entry is
  written is a label entry. The current tags are computed from those entries.
- **A decision is a first-class entry type,** not something inferred from state changes.

## Considered options

- **Built-in stream types (mission, arbitration, channel, DM).** Rejected. They would tie
  cynapse to SDD and cyber-truss.
- **Tags instead of types.** Rejected. A type is one per entry and governs how the payload
  is parsed. Tags are many per entry. They do different jobs.
- **Mutable tags on the entry row.** Rejected. It would break immutability
  ([ADR-0003](0003-entry-identity-and-order.md)).

## Consequences

- Namespaces must not collide. The same lesson applies to reference names
  (buddy-agent-harness#193).
- The core glossary stays domain-neutral: participant, stream, entry, type, tag, anchor,
  view, state, cursor.

## Related

- Evidence: LG11, LG13, LG14, LG15.
- Research rounds 6 and 7 in `changes.md`.
