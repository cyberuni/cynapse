---
"cynapse": patch
---

Deleting an entry or a channel now removes the erased content from disk, not only from reads. Every connection sets `PRAGMA secure_delete = ON`, so SQLite zeroes freed space instead of leaving old content in free pages, and `deleteEntry` and `deleteChannel` checkpoint and truncate the write-ahead log after they commit. The checkpoint is a best effort: it doesn't wait for a reader holding an older snapshot, and the delete succeeds either way. Content in `cynapse.*` entries, such as state values, titles and purposes, still can't be deleted.
