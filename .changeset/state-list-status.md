---
'cynapse': patch
---

`cynapse state list --status` now rejects a value other than `open` or `resolved` with exit 2, as `state set` does, instead of returning an empty list.
