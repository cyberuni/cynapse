---
'cynapse': minor
---

Add `Store.changes(since?)` and `cynapse changes [--since <token>]`, a store-wide change token a
runtime can poll cheaply. It returns an opaque token and the channels whose `lastSeq` moved after
the given token, or every channel without one. Every append bumps it, metadata entries included.
A token from another store fails with `foreign_token`. The schema gains a migration that backfills
existing databases. `ChannelTraits.wake` is documented as advice to the runtime: cynapse never wakes anyone.
