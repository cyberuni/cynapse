---
"cynapse": patch
---

Version the database schema. The store records its schema version in `PRAGMA user_version` and runs any pending forward migrations in one transaction when it opens, so existing databases upgrade in place. A database newer than the installed cynapse is refused with the `schema_too_new` error instead of being written to.
