# ADR-0010: A network of subjects across stores

## Status

Accepted, 2026-10-03. Not built yet. Amends [ADR-0005](0005-consumer-defined-types-tags-and-traits.md).

## Context

Work for agents spreads across several stores. An issue lives in GitHub, its task in
Asana, the mission working on it in SDD, and the discussion about it in a cynapse channel.
These things relate to each other: a PR closes an issue, an issue splits into subtasks, a
mission works on an issue. The earlier ADRs model relations only inside cynapse, as anchors
from one channel to another ([ADR-0004](0004-stream-identity-handles-and-anchors.md)).
Anchors form a tree, but issues and PRs form a graph: one PR can close several issues, and
one issue can take several PRs.

[DNA (Datum Network Architecture)](https://github.com/unional/dna) describes this shape.
Each datum holds information about itself only. Relations are first-class. Hierarchy is
metadata seen from one viewpoint, never part of identity. A datum's type comes from its
owner, while each consumer may perceive it as something else. DNA is an architecture, not
a storage choice, so its structure can be built from any store that can carry the
metadata.

## Decision

- **The structure is a network of subjects.** A subject is anything a conversation can be
  about: an issue, a PR, a task, a repository, a participant, a mission. Each subject lives
  in the store that owns it.
- **A relation is metadata on both ends.** "#15 closes #12" or "#12 split into Asana task
  X" is written on each subject in its own store (frontmatter, labels, custom fields), as
  a doubly linked list. The two writes are not atomic, and either end can be edited from
  outside, so **a reader treats a relation as present if either end records it.** The
  second end exists to make lookup cheap, not to make the relation consistent.
- **Hierarchy is a view, not identity.** Parent and child, epic and story, issue and
  sub-issue are relations. No subject's or channel's identity derives from its place in a
  hierarchy.
- **A subject's type comes from its store; consumers attach perceived types.** A GitHub
  issue's type is `gh.issue`. When SDD works on it, SDD perceives it as `sdd.mission`. A
  subject can carry any number of perceived types, one per consumer role. A subject that
  is native to cynapse, such as an arbitration branched from an anchor, still gets its
  type from the consumer that creates it, as ADR-0005 says.

## Considered options

- **A network of subjects across stores (chosen).**
- **Mirror the tracker's hierarchy as channel structure.** Rejected. It copies the work
  graph into cynapse, which [ADR-0002](0002-own-only-communication-with-no-other-home.md)
  rules out, and a parent fixed into identity goes wrong when work is reorganized.
- **Keep relations in cynapse's store only.** Rejected. A store that already holds the
  subject can hold the relation too, and a separate copy drifts when the subject is
  changed outside cynapse.
- **One type per channel, defined by a consumer (ADR-0005 as written).** Rejected for
  subjects outside cynapse. Two consumers working on the same issue would either collide
  on its channel or split its conversation into two channels.

## Consequences

- A store that cannot carry metadata can only be a subject's home if cynapse holds its
  relations for it ([ADR-0011](0011-cynapse-stores-only-what-no-other-store-can.md)).
- How a relation is spelled in each store (a frontmatter key, a label, an Asana custom
  field) is a convention owned by that store's plugin
  ([ADR-0008](0008-routing-conventions-and-init-cynapse.md)).
- The relation names (`closes`, `split-into`, `superseded-by`, `works-on`) can be revisited
  cheaply. That relations sit on the subjects, and that hierarchy stays out of identity, is
  expensive to undo.

## Related

- [ADR-0012](0012-channels-are-keyed-by-subject.md): channels keyed by subject.
- DNA: `internal/datum.md`, `internal/datumType.md`, `internal/designConsideration.md`.
- Research round 11 in `changes.md`.
