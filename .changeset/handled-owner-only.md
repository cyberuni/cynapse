---
'cynapse': minor
---

`cynapse.handled` is now a reserved tag: only the owner of an address channel may add or remove it,
through `addTags`/`removeTags`, `cynapse tag` or at append time. Anyone else fails with the `not_owner`
error code, and the tag on a work channel fails with `not_address`; neither writes a `cynapse.label`
entry. The tag name is exported as `HANDLED_TAG`.
