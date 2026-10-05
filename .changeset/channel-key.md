---
'cynapse': minor
---

Add `channelKey` and `channelIdOf`, which build a subject's channel key from its store and
native ID (`subject:<store>:<nativeId>`, such as `subject:gh:R_kgDOPfmJ6A`) and derive the
channel's UUIDv5 from it. Two runtimes that resolve the same native ID derive the same channel.
