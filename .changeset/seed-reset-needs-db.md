---
'cynapse': patch
---

`cynapse dev seed --reset` now requires an explicit `--db`. Without one it exits with a usage error instead of deleting the default `$CYNAPSE_HOME/cynapse.db`.
