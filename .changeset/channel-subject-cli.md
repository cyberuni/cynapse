---
'cynapse': minor
---

`cynapse channel create` takes `--store` and `--native-id` to key a channel by its subject, and
`--kind address --owner <participant>` for an address channel; an address without `--store` gets a
minted key. New verbs: `channel resolve --store --native-id` finds a channel by any of its keys,
`channel add-key` adds an alias key after a move, and `channel owner` changes an address channel's
owner. `channel list --kind` filters by kind, and `channel show` names the owner and keys.
