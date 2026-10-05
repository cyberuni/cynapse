---
'cynapse': minor
---

Channels now have a kind (ADR-0012). An address channel is keyed by a subject that can receive
messages and has an `owner`; a work channel has members and no owner. `createChannel` takes a
`subject` (`{ store, nativeId }`) and derives the channel id from it, so a second consumer that
opens the same subject gets the same channel whatever type it perceives. `addSubject` adds an alias
key when a subject moves, `getChannelBySubject` resolves any of a channel's keys, `setOwner`
changes an address channel's owner and logs `cynapse.channel.owner-changed`, and `registerAddress`
mints a `cynapse` subject for an address with no native ID, such as a folder. `Channel` gains
`kind`, `owner` and `subjects`, handles may contain `:`, and schema migration 3 makes every
existing channel a work channel.
