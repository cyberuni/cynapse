# Architecture decision records

Each file records one decision: its context, what was decided, the options considered,
and the consequences. The evidence behind them is in
[`.research/agent-messaging-architecture/`](../../.research/agent-messaging-architecture/),
and claim IDs such as `SD02` or `LC10` point into its `evidence.md`.

A decision is changed by a new record that supersedes the old one, never by rewriting it.

| ADR | Decision |
| --- | --- |
| [0001](0001-record-decisions-in-docs-adr.md) | Record architecture decisions in `docs/adr/` |
| [0002](0002-own-only-communication-with-no-other-home.md) | cynapse owns only communication with no other home |
| [0003](0003-entry-identity-and-order.md) | Entries: UUIDv7 identity, owner-assigned `seq`, immutable |
| [0004](0004-stream-identity-handles-and-anchors.md) | Streams: UUID identity, renameable handles, anchor entries |
| [0005](0005-consumer-defined-types-tags-and-traits.md) | Types and tags are namespaced and defined by consumers |
| [0006](0006-state-views-and-lifecycle.md) | State records, views, and lifecycle instead of deletion |
| [0007](0007-stock-sqlite-outside-the-repository.md) | Stock SQLite outside the repository; the write transaction orders |
| [0008](0008-routing-conventions-and-init-cynapse.md) | Routing kinds, prefixed conventions, and `init-cynapse` |
| [0009](0009-call-the-stream-a-channel.md) | Call the stream a channel |
| [0010](0010-a-network-of-subjects-across-stores.md) | A network of subjects across stores |
| [0011](0011-cynapse-stores-only-what-no-other-store-can.md) | cynapse stores only what no other store can; it guides and composes |
| [0012](0012-channels-are-keyed-by-subject.md) | Channels are keyed by subject: address and work channels |
| [0013](0013-messaging-between-participants.md) | Messaging between participants on work and address channels |
| [0014](0014-deleting-entries-and-channels.md) | Deleting an entry or a channel |
