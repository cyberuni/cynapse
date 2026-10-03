# ADR-0011: cynapse stores only what no other store can; it guides and composes

## Status

Proposed, 2026-10-03. Supersedes the Decision section of
[ADR-0002](0002-own-only-communication-with-no-other-home.md); its context and rejected
options still stand.

## Context

ADR-0002 settled that cynapse doesn't copy what GitHub, Asana or Linear hold, and doesn't
wrap them in adapters. It still listed "change feeds" as something cynapse owns, and left
open how a consumer reaches information that lives elsewhere. Once relations live on the
subjects in their own stores ([ADR-0010](0010-a-network-of-subjects-across-stores.md)),
the question becomes what is left for cynapse's store, and what cynapse does for facts it
doesn't store.

Every fact written in two places can drift. The external store can be changed at any time
by people and tools that never pass through cynapse.

## Decision

- **Each fact has one home.** A subject, its metadata and its relations live in the store
  that owns the subject. When cynapse writes metadata into an external store, it writes
  through and keeps no copy. From then on that store owns the fact.
- **cynapse's store is used only where no external store fits,** or where the one
  available lacks a capability we need: ledgers, logs, ordered immutable entries with
  `seq`, leases, presence and read state. Channels live there, because GitHub comments and
  Asana stories can be edited and deleted and carry no order owner.
- **Consumers talk to external stores directly.** cynapse neither records nor caches
  external changes. It reads from the source when a consumer asks.
- **cynapse guides and composes.**
  - *Guidance:* through buddy-agent-harness and context-aware skills, cynapse tells a
    consumer what to fetch, from where, and how to read it: which query returns a
    subject's timeline, and what its relation metadata means.
  - *Composition:* a consumer passes the data it fetched to cynapse, and cynapse returns
    a structured result. A change feed across stores, merging GitHub's timeline for #12
    with the entries in #12's work channel, is composed when it is read and never stored.
- **cynapse holds no credentials for an external store and never calls one.** Auth, rate
  limits and per-store APIs stay with the consumer, whether that is a user, an agent or a
  custom UI such as Cortex.

## Considered options

- **Store only what no other store can, and guide and compose (chosen).**
- **Fetch through cynapse.** Rejected. It needs credentials, rate-limit handling and an
  adapter for each service, which ADR-0002 rejected because each adapter lags the service
  it wraps.
- **Keep a local index or cache of external metadata.** Rejected. Once relations sit on
  the subjects, the source answers lookups itself, and a copy drifts whenever the source
  changes from outside.
- **Record external changes as entries.** Rejected. It copies the source's history into a
  second home.

## Consequences

- Composition is part of the package's library surface (`index.ts`), so a UI can fetch
  with its own credentials and compose in process.
- Pausing and resuming a session is a separate concern, not a cache
  (repobuddy/repobuddy#734).
- Whether a store's API can answer "what is related to X" cheaply decides how much
  guidance a consumer needs. A store that can't answer it is a reason to use cynapse's
  store for that store's relations.
- That cynapse holds no credentials is expensive to undo. Which facts count as having no
  home is decided case by case and can be revisited cheaply.

## Related

- [ADR-0002](0002-own-only-communication-with-no-other-home.md), [ADR-0008](0008-routing-conventions-and-init-cynapse.md).
- Research round 11 in `changes.md`.
