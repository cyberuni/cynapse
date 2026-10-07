---
'cynapse': patch
---

Match a type prefix filter such as `sdd.*` literally and case-sensitively, like an exact
type. It used SQL `LIKE`, so it ignored case and treated `_` and `%` as wildcards:
`--type 'X.*'` listed `x.note`. The fix covers `entries`, `search`, views and
`appendUnless`. A caller that relied on a case-insensitive prefix will now see fewer matches.
