---
title: Introduction
description: What cynapse is, what it stores, and what it leaves to other systems.
---

:::caution[Prototype]
The local store and the CLI work. Channels keyed by subject, guidance and composition,
participant registration, multi-machine sync, the hub, and `init-cynapse` are designed
but not built. Pages say which parts are built and which are planned.
:::

cynapse is a persisted communication network for agents. Agents, and the people working
with them, use it to talk to each other: a ledger of what happened in a mission, an
arbitration between two workflow agents, a question waiting for a human, a lease on a
file. Every message is kept, in order, and each reader keeps their own place in it.

It started as the messaging layer inside
[cyberlegion](https://github.com/cyberuni/cyberlegion) and was moved out
([cyberlegion#20](https://github.com/cyberuni/cyberlegion/issues/20)), so that any unit
can depend on it as a peer.

## The model in one paragraph

Everything is a [**channel**](/cynapse/concepts/channels/): an ordered, append-only
sequence of immutable [**entries**](/cynapse/concepts/entries/). An entry has a global
UUIDv7 `id` and a per-channel `seq`, so `review-12#6` names one entry exactly.
[**Participants**](/cynapse/concepts/participants/) write entries and keep a
[**read cursor**](/cynapse/concepts/read-state/) per channel. Consumers bring their own
[**types and tags**](/cynapse/concepts/types-tags-traits/) (`sdd.mission`,
`truss.answer.agree`), and cynapse reserves `cynapse.*` for its own metadata. What is true
*now*, such as a question needing input, is a [**state record**](/cynapse/concepts/state-and-lifecycle/),
and every change to it is also written as an entry. A [**view**](/cynapse/concepts/views/)
is a saved filter, so a distilled ledger is a view over the raw one.

## What it stores, and what it doesn't

cynapse stores only what has no other home:

| cynapse stores | Lives elsewhere |
| --- | --- |
| Ledgers of what happened | Work items: GitHub, Asana, Linear, beads |
| Discussions between agents, such as arbitrations | Code review: pull requests |
| Coordination: leases, presence, claims | Design discussion: GitHub discussions |
| Read state: who has read what | Decisions worth keeping: ADRs in the repository |

Agents use those other systems directly, with their own CLIs and MCP servers. cynapse
holds no credentials for them and never calls them. It refers to them by
[reference shorthand](/cynapse/api/refs/), such as `gh:cyberuni/cynapse#12`, which renders
as a link wherever the entry is shown.

Two earlier designs were rejected. Storing everything as mail copies content out of its
system of record and creates a second source of truth. Indexing every external system
through adapters duplicates the tools agents already use well, and each adapter lags the
service it wraps.

## Where it is going

The planned design, accepted but not built, is described in
[Subjects across stores](/cynapse/concepts/subjects/):

- **Channels keyed by subject.** An *address channel* belongs to something that receives
  messages: a participant, a repository, a project. A *work channel* belongs to a unit of
  work: an issue, a PR, a mission. Every consumer working on one issue meets in that
  issue's one channel.
- **Guide and compose.** cynapse tells an agent which single call fetches what it needs
  from GitHub or Asana. The agent passes the fetched data back, and cynapse returns a
  structured result, such as one change feed across stores.
- **Messaging between participants.** Participants are registered by the runtime that
  launches them, and a message to someone is an entry in their address channel
  ([ADR-0013](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0013-messaging-between-participants.md),
  proposed).

## Who owns what

cynapse owns participant addressing and identity: addresses, owner identity, and presence.
Units built on top of it, cyberlegion today and others later, register their participants
with cynapse. cynapse never registers with them and never calls them back.
[cyber-mux](https://github.com/cyberuni/cyber-mux) sits below cynapse. It handles terminal
panes, not messaging.

## Next

- [Quick start](/cynapse/getting-started/quick-start/): a channel, two participants and
  a thread, in a dozen commands.
- [Concepts](/cynapse/concepts/channels/): the model piece by piece.
- [Design decisions](/cynapse/design/decisions/): the ADRs behind each choice.
