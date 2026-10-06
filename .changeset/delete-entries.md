---
'cynapse': minor
---

Delete an entry, and purge a retired participant's address channel (ADR-0014).
`Store.deleteEntry` and `cynapse entry delete` erase one entry's content on an address
channel, by its owner, and leave a tombstone that keeps its `seq`, `parent` and `root`
resolving, logged as `cynapse.entry.deleted`. `Store.purgeParticipant` and
`cynapse participant purge` do the same for every entry in a retired participant's address
channel outside `cynapse.*`, by the participant or the unit that registered it, logged as
`cynapse.participant.purged`. `Entry` gains `deleted`, and listings hide tombstones unless
`includeDeleted` (`--include-deleted`) is set.
