---
'cynapse': minor
'@cyberuni/cynapse-gui': patch
---

Add `Store.appendUnless`, which appends an entry only if no entry in the channel matches a condition,
checked in the same write transaction that assigns `seq`. The GUI rules on a decision with it, so two
rulings submitted at once can no longer both land.
