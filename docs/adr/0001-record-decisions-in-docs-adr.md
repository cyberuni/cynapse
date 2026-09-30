# ADR-0001: Record architecture decisions in `docs/adr/`

## Status

Accepted, 2026-09-30.

## Context

The design of cynapse was argued over nine research rounds (`.research/agent-messaging-architecture/`).
The research records evidence and the current best verdict, but a reader looking for what
was *decided*, and when, has to reconstruct it from `conclusion.md` and `changes.md`. The
decisions span the whole repository: the stream model constrains `packages/cynapse`,
Cortex (`apps/cortex`), and a future hub alike.

## Decision

Architecture decisions live in `docs/adr/` at the repository root, one numbered file per
decision, with the sections Status, Context, Decision, Considered options, Consequences,
and Related. An ADR cites the research by claim ID. A changed decision gets a new ADR that
supersedes the old one.

## Considered options

- **`docs/adr/` at the root (chosen).** It covers every package, matches cyber-sdd's
  layout, and sits beside `.research/`, which it cites.
- **`packages/cynapse/docs/adr/`.** This would put Cortex's constraints inside the npm
  package's folder.
- **An SDD project spec corpus (`.agents/spec/.../decisions/`).** That is right if cynapse
  adopts SDD. It hasn't yet, and moving the files later is cheap.

## Consequences

- The research stays the evidence, and the ADRs are the decisions. When they disagree, the
  newest accepted ADR wins, and the research is updated to match.
- If cynapse adopts SDD, these files move into its spec corpus.

## Related

- The research record: `.research/agent-messaging-architecture/conclusion.md`
