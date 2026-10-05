---
'cynapse': patch
---

Opening a fresh database from several processes at once no longer fails with `database is locked`.
SQLite refuses the losing processes' switch to WAL mode immediately instead of waiting out
`busy_timeout`, so the store now retries that switch within the same timeout.
