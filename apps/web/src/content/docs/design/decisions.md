---
title: Design decisions
description: The architecture decision records behind cynapse, with what each one decided and whether it is built.
---

Each decision is recorded as an ADR in
[`docs/adr/`](https://github.com/cyberuni/cynapse/tree/main/docs/adr). A decision is
changed by a new record that supersedes the old one, never by rewriting it. ADRs 0001 to
0008 say *stream*. Read it as *channel* (ADR-0009).

| ADR | Decision | Status | Explained in |
| --- | --- | --- | --- |
| [0001](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0001-record-decisions-in-docs-adr.md) | Record architecture decisions in `docs/adr/` | Accepted | — |
| [0002](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0002-own-only-communication-with-no-other-home.md) | Own only communication with no other home | Accepted; its Decision superseded by 0011 | [What is cynapse](/cynapse/what-is/), [What cynapse stores](/cynapse/design/scope/) |
| [0003](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0003-entry-identity-and-order.md) | Entries: UUIDv7 identity, owner-assigned `seq`, immutable | Built | [Entries](/cynapse/concepts/entries/) |
| [0004](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0004-stream-identity-handles-and-anchors.md) | Channels: UUID identity, renameable handles, anchor entries | Built | [Channels](/cynapse/concepts/channels/) |
| [0005](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0005-consumer-defined-types-tags-and-traits.md) | Types and tags are namespaced and defined by consumers | Built | [Types, tags and traits](/cynapse/concepts/types-tags-traits/) |
| [0006](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0006-state-views-and-lifecycle.md) | State records, views, and lifecycle instead of deletion | Built, except leases | [State and lifecycle](/cynapse/concepts/state-and-lifecycle/), [Views](/cynapse/concepts/views/) |
| [0007](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0007-stock-sqlite-outside-the-repository.md) | Stock SQLite outside the repository; the write transaction orders | Built for one machine | [Storage](/cynapse/concepts/storage/) |
| [0008](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0008-routing-conventions-and-init-cynapse.md) | Routing kinds, prefixed conventions, and `init-cynapse` | Accepted, not built | — |
| [0009](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0009-call-the-stream-a-channel.md) | Call the stream a channel | Built | [Channels](/cynapse/concepts/channels/) |
| [0010](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0010-a-network-of-subjects-across-stores.md) | A network of subjects across stores | Accepted, not built | [Subjects across stores](/cynapse/concepts/subjects/) |
| [0011](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0011-cynapse-stores-only-what-no-other-store-can.md) | Store only what no other store can; guide and compose | Accepted, not built | [What cynapse stores](/cynapse/design/scope/) |
| [0012](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0012-channels-are-keyed-by-subject.md) | Channels are keyed by subject: address and work channels | Accepted, not built | [Subjects across stores](/cynapse/concepts/subjects/#channels-keyed-by-subject) |
| [0013](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0013-messaging-between-participants.md) | Messaging between participants on work and address channels | Proposed | [Messaging](/cynapse/concepts/messaging/), [cynapse and the runtime](/cynapse/design/runtime/) |

The status words are defined on [Status](/cynapse/design/status/). Which of these
decisions are expensive to unwind is listed on
[How cynapse fits together](/cynapse/design/#expensive-to-unwind).

## Evidence

The research behind these decisions, with claim IDs such as `LC10` or `SY08`, is in
[`.research/agent-messaging-architecture/`](https://github.com/cyberuni/cynapse/tree/main/.research/agent-messaging-architecture).
