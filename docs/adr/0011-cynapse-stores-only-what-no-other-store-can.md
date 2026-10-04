# ADR-0011: cynapse stores only what no other store can; it guides and composes

## Status

Accepted, 2026-10-03. Not built yet. Supersedes the Decision section of
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
  - *One call per store:* guidance names a single invocation per store (one `gh`, `glab`,
    `cyber-asana` or Linear call) that returns a subject's native ID, metadata and
    relations. The timeline is a follow-up call that pages: no store returns a complete
    history in one call (LC13). A store that needs two calls for the subject itself is a
    gap for that store's plugin to close, not a reason for cynapse to call the store.
  - *Composition:* a consumer passes the data it fetched to cynapse, and cynapse returns
    a structured result. A change feed across stores, merging GitHub's timeline for #12
    with the entries in #12's work channel, is composed when it is read and never stored.
- **cynapse holds no credentials for an external store and never calls one.** Auth, rate
  limits and per-store APIs stay with the consumer, whether that is a user, an agent or a
  custom UI such as Cortex.

### Write-back

A work channel is the working conversation. The subject's own store is what that store's
readers see. **A consumer writes back to the subject's store only what changes the
subject as those readers see it, and never mirrors the conversation.** Four triggers:

1. **A decision that changes scope or approach** updates the subject's description (the
   GitHub issue body), so the description stays the current spec. Each such edit gets a
   short comment saying what changed, with a link to the decision entry. A body edit
   leaves no timeline event (LC13), so without the comment the change is invisible to
   anyone watching the subject.
2. **A change in the channel's state records** maps to a label or field. For example,
   `needs-input` becomes a "needs decision" label, and the label is removed when the
   state clears. Readers of the store can then see stalled work without opening cynapse.
3. **A lifecycle milestone** gets one summary comment: a PR opened, an escalation that
   needs a human who works in that store, and the channel being reconciled. The
   reconciled summary is the distilled result, with a link back to the channel, not the
   transcript.
4. **A relation** is written as metadata on the subjects
   ([ADR-0010](0010-a-network-of-subjects-across-stores.md)), not as a comment.

Individual messages, arbitration transcripts, and coordination (leases, claims, presence)
are never written back.

**The consumer writes; cynapse supplies the trigger.** A decision entry or state change in
the channel tells the consumer, through the store plugin's convention
([ADR-0008](0008-routing-conventions-and-init-cynapse.md)), what to write and in what
format. The four triggers are conventions, not cynapse entry types.

**Each write-back is linked in both directions.** The consumer records a
`cynapse.published` entry in the channel that refers to what it wrote, such as the GitHub
comment, and what it wrote carries a stamp pointing back to that entry. This records
cynapse's own action, not a change made outside cynapse, so it doesn't conflict with
reading external stores from their source.

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
- **Mirror the channel into the subject's store,** for example every message as a comment.
  Rejected. It floods the store's readers, copies the conversation into a second home,
  and exposes raw transcripts that only the distilled result should reach.
- **Make the write-back triggers cynapse entry types.** Not chosen. Each organization
  decides what its readers see, so the triggers belong to the store plugin's convention.

## Consequences

- Composition is part of the package's library surface (`index.ts`), so a UI can fetch
  with its own credentials and compose in process.
- Pausing and resuming a session is a separate concern, not a cache
  (repobuddy/repobuddy#734).
- Whether a store's API can answer "what is related to X" cheaply decides how much
  guidance a consumer needs. A store that can't answer it is a reason to use cynapse's
  store for that store's relations.
- `cynapse.published` is the one entry type that write-back adds. It is added when the
  first write-back is built, and consumers will depend on its shape. The triggers are
  convention content and can be revisited cheaply.
- That cynapse holds no credentials is expensive to undo. Which facts count as having no
  home is decided case by case and can be revisited cheaply.

## Related

- [ADR-0002](0002-own-only-communication-with-no-other-home.md), [ADR-0008](0008-routing-conventions-and-init-cynapse.md).
- Evidence: LC13.
- Research round 11 in `changes.md`.
