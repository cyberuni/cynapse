---
'cynapse': minor
---

Print errors on stdout, as axi asks: `error: <message>` in text and `{ "error": { "code", "message" } }` under `--json`, including usage errors. A missing channel, entry or view is now coded `not_found`.
