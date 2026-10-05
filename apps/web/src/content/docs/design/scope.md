---
title: What cynapse stores
description: The one-home rule — what cynapse keeps, what it leaves to other stores, how it guides and composes instead of fetching, and what a consumer writes back.
---

:::note[Partly built]
The store for channels, entries, cursors and state is built. Guidance, composition and
write-back are accepted ([ADR-0011](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0011-cynapse-stores-only-what-no-other-store-can.md)),
not built. Today a reference such as `gh:cyberuni/cynapse#12` is stored as written and
rendered as a link.
:::

Every fact written in two places can drift, and an external store can be changed at any
time by people and tools that never pass through cynapse. So **each fact has one home.**

## What lives where

| cynapse stores | Lives in its own store |
| --- | --- |
| Ledgers of what happened in a mission or a run | Work items: GitHub issues, Asana, Linear, beads |
| Discussions between agents, such as arbitrations | Code review: pull requests |
| Coordination and leases | Design discussion: GitHub discussions |
| Read state: who has read what | Decisions worth keeping: ADRs in the repository |
| Messages between participants, and the `live` or `retired` status a runtime asserts | A subject's metadata and its relations |

cynapse's store is used only where no external store fits, or where the one available
lacks a capability that is needed. GitHub comments and Asana stories can be edited and
deleted, carry no order owner, and keep no per-reader cursor, so channels stay in cynapse.

## Guide and compose

Consumers talk to external stores directly. cynapse neither records nor caches their
changes. For facts it doesn't hold, it does two things:

- **Guide.** Through skills and conventions, cynapse tells a consumer what to fetch, from
  where, and how to read it. Guidance names one call per store (one `gh`, `glab`,
  `cyber-asana` or Linear call) that returns a subject's native ID, metadata and relations.
  The timeline is a follow-up call that pages: no store returns a complete history in one
  call.
- **Compose.** The consumer passes what it fetched to cynapse, and cynapse returns a
  structured result. A change feed for #12, merging GitHub's timeline with the entries in
  #12's work channel, is composed when it is read and never stored. Composition is part of
  the library, so a UI can fetch with its own credentials and compose in process.

**cynapse holds no credentials for an external store and never calls one.** Auth, rate
limits and per-store APIs stay with the consumer, whether that is a person, an agent or a
UI such as Cortex.

## Write-back

A work channel is the working conversation. The subject's own store is what that store's
readers see. A consumer writes back only what changes the subject for those readers, and
never mirrors the conversation:

1. **A decision that changes scope or approach** updates the subject's description, plus a
   short comment saying what changed, because a body edit leaves no timeline event.
2. **A state record** such as `needs-input` maps to a label or field, removed when the state
   clears.
3. **A lifecycle milestone** gets one summary comment: a PR opened, an escalation to a
   human, the channel being reconciled.
4. **A relation** is written as metadata on the subjects, not as a comment.

Individual messages, arbitration transcripts and coordination are never written back. The
consumer does the writing; cynapse supplies the trigger, and each store's plugin owns the
convention for what to write and in what format.

Each write-back is linked both ways: a `cynapse.published` entry in the channel refers to
what was written, and what was written carries a stamp pointing back.

## Raw conversation stays out of repositories

The database lives outside any repository. Only a distilled result reaches one, as an
intended artifact: an ADR, or one summary per reconciled channel. Agents read the raw
conversation through the CLI's narrow reads, never by searching files
([Storage](/cynapse/concepts/storage/)).

## What was rejected

| Option | Why not |
| --- | --- |
| Store everything as mail | Copies content out of its system of record and creates a second source of truth. Email threading shows how copies fail. |
| Index the stores through adapters, or fetch through cynapse | Needs credentials, rate-limit handling and an adapter per service, and each adapter lags the service it wraps. |
| Keep a local cache of external metadata | Once relations sit on the subjects, the source answers lookups itself, and a copy drifts. |
| Mirror the channel into the issue | Floods the store's readers and exposes raw transcripts that only the distilled result should reach. |

## Related

- [Subjects across stores](/cynapse/concepts/subjects/): subjects, relations and channels
  keyed by subject.
- Decisions: [ADR-0002](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0002-own-only-communication-with-no-other-home.md),
  [ADR-0011](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0011-cynapse-stores-only-what-no-other-store-can.md)
