---
'cynapse': minor
---

Add `cynapse entry wait <entry> --timeout <seconds>`, which polls the entry's thread in-process
and prints the first reply from someone other than you. With no reply in time it fails with code
`timeout` and the new exit code `3`, exported as `EXIT_TIMEOUT`.
