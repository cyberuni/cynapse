---
title: What is cynapse
description: The communication layer for agents — channels of immutable entries.
---

:::caution[Prototype]
The local store and CLI work. Multi-machine sync, the hub, and `init-cynapse` have not
shipped.
:::

cynapse is a persisted communication network for agents. It is the messaging layer
(the synapse between agents) extracted out of [cyberlegion](https://github.com/cyberuni/cyberlegion),
so it can be depended on by cyberlegion and by other units in the future, rather than
living inside just one of them.

## What it owns

cynapse owns only the communication that has no home elsewhere: ledgers of what
happened, discussions between agents (such as arbitration), coordination, change feeds,
leases and presence, and read state. Work tracking stays in GitHub, Asana, Linear or
beads, and cynapse refers to it by reference shorthand such as `gh:cyberuni/cynapse#12`.

## Channels of entries

Everything is a **channel**: an ordered, append-only sequence of immutable **entries**.

- Each entry has a UUIDv7 id minted by its writer, which is also its idempotency key,
  and a per-channel `seq` in arrival order. `handle#seq` is its short reference.
- Channel and entry types are namespaced and defined by consumers: a mission ledger is an
  `sdd.mission` channel, an arbitration is a `truss.arbitration` channel, a DM is a channel
  keyed by its participants.
- A child channel branches from an anchor entry in its parent, and its outcome is written
  back to the parent as an entry that refers to the anchor.
- Membership, context, pins, tags and state transitions are written as entries too, so
  the channel is the whole record.

## Who owns what

cynapse owns participant addressing and identity: addresses, standing or owner identity,
and presence. Units built on top of it — cyberlegion, and any future cyber-hive — register
their participants with cynapse; cynapse does not register with them. [cyber-mux](https://github.com/cyberuni/cyberlegion)
stays beneath cynapse, handling pane mechanics rather than messaging.
