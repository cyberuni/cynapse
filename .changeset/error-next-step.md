---
'cynapse': minor
---

Every CLI error now suggests a next step: a `help:` line under the `error:` line in text, and a
`help` field under `--json`. `CynapseError` takes a `help` option, and `helpFor` gives the next step
for any thrown value. An unknown flag lists the flags the command accepts (`options` under `--json`),
and a command group run without a subcommand, or with an unknown one, lists its subcommands
(`subcommands`) on stdout instead of printing its usage to stderr.
