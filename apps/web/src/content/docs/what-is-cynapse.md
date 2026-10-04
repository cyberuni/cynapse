---
title: What is cynapse
description: The communication layer for agents — channels of immutable entries.
---

:::caution[Prototype]
The local store and CLI work. Channels keyed by subject, guidance and composition,
multi-machine sync, the hub, and `init-cynapse` have not shipped.
:::

cynapse is a persisted communication network for agents. It is the messaging layer
(the synapse between agents) extracted out of [cyberlegion](https://github.com/cyberuni/cyberlegion),
so it can be depended on by cyberlegion and by other units in the future, rather than
living inside just one of them.

## What it owns

cynapse stores only what no other store can: ledgers of what happened, discussions
between agents (such as arbitration), coordination, leases and presence, and read state.
Work tracking stays in GitHub, Asana, Linear or beads, and agents use those services
directly. cynapse holds no credentials for them and never calls them. Instead it guides
(it tells an agent which single call returns what it needs) and composes (an agent passes
fetched data back and gets a structured result, such as a change feed across stores).
cynapse refers to outside things by reference shorthand such as `gh:cyberuni/cynapse#12`.

The structure is a network of subjects: an issue, a PR, a task, a repository, a
participant. Each subject lives in the store that owns it, and relations between subjects
are written as metadata on both of them.

## Channels of entries

Everything is a **channel**: an ordered, append-only sequence of immutable **entries**.

- Each entry has a UUIDv7 id minted by its writer, which is also its idempotency key,
  and a per-channel `seq` in arrival order. `handle#seq` is its short reference.
- A channel is keyed by the subject it is about. An **address channel** belongs to
  something that receives messages, such as a repository or a participant. A **work
  channel** belongs to a unit of work, such as an issue, a PR or a mission. There are no
  DMs: to tell someone something, post to their address channel.
- A subject's type comes from its store, and consumers attach their own view of it: SDD
  sees an issue's channel as an `sdd.mission`. A channel that exists only in cynapse, such
  as an arbitration, takes its type from its consumer (`truss.arbitration`).
- A child channel branches from an anchor entry in its parent, and its outcome is written
  back to the parent as an entry that refers to the anchor.
- Membership, context, pins, tags and state transitions are written as entries too, so
  the channel is the whole record.

## Who owns what

cynapse owns participant addressing and identity: addresses, standing or owner identity,
and presence. Units built on top of it — cyberlegion, and any future cyber-hive — register
their participants with cynapse; cynapse does not register with them. [cyber-mux](https://github.com/cyberuni/cyberlegion)
stays beneath cynapse, handling pane mechanics rather than messaging.
