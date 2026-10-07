---
'cynapse': patch
---

A participant's own address channel now shows in its `cynapse unread`. The owner of an address channel is a member of it, with role `owner`: creating an address channel or registering a participant adds the owner, and `cynapse channel owner` makes the new owner a member with role `owner` and changes the old owner's role to `member`, each logged as `cynapse.member.joined`. A schema migration adds the owner as a member of every existing address channel, with its entry.

Callers will notice: `unread` gains the owner's address channels, a channel's `members` lists its owner, and an address channel has one more entry after it is created.
