---
'cynapse': minor
---

Add `cynapse participant register|retire|rename|resolve|list`, and `cynapse entry send <name>`, which
appends to the addressee's address channel after resolving the exact name among live participants.
Sending never creates a participant: an unknown name exits `5` (`unknown_address`) and an ambiguous
one exits `4` (`ambiguous_address`), with every candidate in `error.candidates` under `--json`.
