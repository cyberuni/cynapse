---
'cynapse': patch
---

A command group run without a subcommand, such as `cynapse channel`, now prints its usage
to stderr and exits `2` instead of printing nothing and exiting `0`.
