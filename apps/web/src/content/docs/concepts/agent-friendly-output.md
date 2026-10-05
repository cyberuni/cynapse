---
title: Agent-friendly output
description: How the CLI is shaped for agents — structured output, definitive empty states, one-line errors, exit codes to branch on.
---

Most of cynapse's callers are agents. The CLI follows the
[10 agent-CLI principles](https://github.com/kunchenguid/axi#the-10-principles), and every
command behaves the same way.

## `--json` everywhere

Every command prints a compact human-readable line by default and the full structured
value with `--json`. The JSON has the same shapes the library returns, so a reader of
either sees one model ([Types](/cynapse/api/types/)).

```console
$ cynapse --as bob --json unread
{
  "count": 1,
  "items": [
    {
      "channelId": "01a10a46-3b99-70e1-a37c-bfd6bb6e74a2",
      "handle": "review-12",
      "count": 1
    }
  ]
}
```

## Empty results say what was empty

A query that matches nothing names what it found none of, instead of printing nothing.
A caller can tell "nothing matched" from "the command did nothing".

```console
$ cynapse --as zed unread
0 unread channels found

$ cynapse --as zed --json unread
{
  "count": 0,
  "entity": "unread channels",
  "items": []
}
```

## Errors are one line

A failure prints one line on stderr that names what failed, with no stack trace:

```console
$ cynapse entry show nope#9
no entry found for "nope#9"
```

Under `--json` the line is a JSON object with a stable code, so a caller branches on the reason
rather than on prose:

```console
$ cynapse --json entry show nope#9
{"error":{"code":"not_found","message":"no entry found for \"nope#9\""}}
```

The codes are listed in the [CLI overview](/cynapse/cli/#errors).

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success, including `--help` and `--version` |
| `1` | The command ran and failed: `not_found`, `id_conflict` |
| `2` | Usage error: unknown flag or subcommand, a command group run without a subcommand, missing argument or required option, an option value that doesn't parse |

The set stays small on purpose. A new code needs a reason a caller would act differently.

## Cheap reads

An agent pays for every token it reads. The read commands let it take only what it needs:
`--unread`, `--meta-only`, `--from-summary`, `--view`, `--after`, `--limit`, and
`channel show` as a one-call briefing ([Entries](/cynapse/concepts/entries/#reading-less)).

## Idempotent writes

`entry append --id <uuid>` and `channel create --key` or `--anchor` can be retried safely.
The same input returns what is already there, and different input fails with
`id_conflict` instead of writing a duplicate.

## Related

- CLI: [overview](/cynapse/cli/)
- API: [errors](/cynapse/api/ids/)
