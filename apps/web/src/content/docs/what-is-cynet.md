---
title: What is cynet
description: The messaging layer under cyberlegion — mail, channels, and DMs.
---

:::caution[Design, not implementation]
cynet is at scaffold stage. Nothing described here has shipped yet.
:::

cynet is a persisted communication network for agents. It is the messaging layer
("cyber-net") extracted out of [cyberlegion](https://github.com/cyberuni/cyberlegion),
so it can be depended on by cyberlegion and by other units in the future, rather than
living inside just one of them.

## Three conversation kinds

Like Slack or Discord, cynet supports three kinds of conversation:

- **Mail** — addressed, point-to-point, and durable. A message is consumed by
  acknowledging it, the way an inbox item is read and cleared.
- **Channels** — named, with many members, and subscribed to rather than addressed.
  Reading a channel never consumes what was read.
- **DMs** — a persistent conversation between two or more participants, durable across
  sessions the way mail is, but shaped like a running conversation rather than a queue.

## Who owns what

cynet owns participant addressing and identity: addresses, standing or owner identity,
and presence. Units built on top of it — cyberlegion, and any future cyber-hive — register
their participants with cynet; cynet does not register with them. [cyber-mux](https://github.com/cyberuni/cyberlegion)
stays beneath cynet, handling pane mechanics rather than messaging.
