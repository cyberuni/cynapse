---
'cynapse': patch
---

`channel create --member … --context …` now adds its members and context in the same transaction
that creates the channel, so a failed create leaves nothing behind and can be retried.
`CreateChannelInput` takes `members` and `context` to do the same from the library.

`addParticipant` is deprecated in favour of `registerParticipant`. Until it goes, each change it
makes is logged as `cynapse.participant.added` or `cynapse.participant.updated` in a new
`cynapse.participants` channel. Callers will notice that channel in `channel list`, including in
the seeded example world.
