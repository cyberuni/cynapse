---
"cynapse": patch
---

Opening a store no longer takes the write lock when its schema is current, so a read no longer waits behind a writer or fails with `database is locked`. Only an open that has migrations to run takes the lock.
