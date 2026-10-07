---
'cynapse': patch
---

A database locked by another process past the busy timeout now fails with the error code `busy`
("retry"), and a full disk, an I/O error, or a damaged or non-database file fails with `storage`,
whose help names the file and the integrity check to run. Both were reported as `failure` with
help calling them a cynapse bug. The exit code stays `1`; callers that branched on `failure` for
these now see the new codes.
