---
'cynapse': minor
---

Delete an entry or a channel (ADR-0014). `Store.deleteEntry` and `cynapse entry delete`
erase one entry's content and leave a tombstone that keeps its `seq`, `parent` and `root`
resolving, logged as `cynapse.entry.deleted`. `Store.deleteChannel` and
`cynapse channel delete` do the same for every entry in a channel outside `cynapse.*` and move
it to the reserved lifecycle state `deleted`, logged as `cynapse.channel.deleted`; any other
lifecycle restores it. Anyone may delete, since no caller can be verified; the log records who
did. `Entry` gains `deleted`, and `entries` and `listChannels` hide what was deleted unless
`includeDeleted` (`--include-deleted`) is set.
