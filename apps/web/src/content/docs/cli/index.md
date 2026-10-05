---
title: CLI
description: The cynapse command — global options, environment, references and exit codes, with every command in one table.
---

The binary is `cynapse`. Every command opens the local database, does one thing through the
[`Store`](/cynapse/api/store/) interface, and closes it again. There is no daemon: any number of
processes can read and write the same file at once.

The CLI follows the
[10 agent-CLI principles](https://github.com/kunchenguid/axi#the-10-principles): structured output on
demand, a definitive empty state, and exit codes a caller can branch on. See
[Agent-friendly output](/cynapse/concepts/agent-friendly-output/) for the reasoning.

**Usage**

```bash
cynapse [global options] <command> [subcommand] [args] [options]
```

## Global options

Global options go before the command name or anywhere after it.

| Option | Effect |
| --- | --- |
| `--json` | Emit JSON instead of human-readable text. Applies to every command's success output. |
| `--db <path>` | The database file. Defaults to `$CYNAPSE_HOME/cynapse.db`. |
| `--as <participant>` | The participant acting. Defaults to `$CYNAPSE_PARTICIPANT`. |
| `-v, --version` | Print the version and exit `0`. |
| `-h, --help` | Print usage and exit `0`. Works on every command. |

## Environment

| Variable | Effect |
| --- | --- |
| `CYNAPSE_HOME` | Directory holding the database. The file is `$CYNAPSE_HOME/cynapse.db`; the directory defaults to `~/.cynapse`. `--db` overrides it. |
| `CYNAPSE_PARTICIPANT` | The participant to act as when `--as` is not given. |

Commands that write — and `read`, `unread`, `entry list --unread` and `entry wait` — need an identity. With neither
`--as` nor `$CYNAPSE_PARTICIPANT` they fail with exit `2`:

```text
no participant: pass --as <participant> or set CYNAPSE_PARTICIPANT
```

Read-only commands (`channel list`, `channel tree`, `entry show`, `state list`, …) do not need one.
`channel show` accepts one and, when given, adds the participant's unread count to the briefing.

The first time a participant id is used it is registered automatically as an `agent` named after
its id. See [Participants](/cynapse/concepts/participants/).

## Channel and entry references

Wherever a command takes `<channel>`, it accepts any of:

| Form | Example |
| --- | --- |
| The channel's UUID | `01a10a46-285f-7030-9476-3ba7ccefc378` |
| Its current handle | `m-channel-ids` |
| A handle it used to have | `demo-notes` after `channel rename demo-notes notes-2` |

Wherever a command takes `<entry>`, it accepts an entry's UUID or the short form `handle#seq`, for
example `m-channel-ids#4`. The handle part may itself be a past handle. An entry UUID is the
globally stable name; `handle#seq` is the readable one. See
[Channels](/cynapse/concepts/channels/) and [Entries](/cynapse/concepts/entries/).

Context and `--ref` values are different: they are free-form [reference shorthands](/cynapse/api/refs/)
such as `gh:cyberuni/cynapse#12`, stored as written.

## Output

Success output goes to stdout: text by default, or pretty-printed JSON with `--json`. A listing that
matches nothing says so — `0 channels found`, `0 unread entries found` — rather than printing a
blank line; under `--json` it is `{ "count": 0, "entity": "channels", "items": [] }`. A non-empty
listing under `--json` is `{ "count": n, "items": [...] }`.

Errors go to stdout too, with no stack trace: `error: <message>` in text, and a JSON object carrying a
stable code under `--json`. stderr is left for diagnostics. See [Errors](#errors).

## Errors

Under `--json`, a failure — including a usage error — prints `{ "error": { "code", "message" } }` on
stdout, so a caller branches on the reason without parsing prose:

```console
$ cynapse --json entry show nope#9
{
  "error": {
    "code": "not_found",
    "message": "no entry found for \"nope#9\""
  }
}
```

The `code` is the contract; the `message` is for people and may change. These codes are stable:

| Code | Exit | Meaning |
| --- | --- | --- |
| `usage` | `2` | Any usage error listed under [Exit codes](#exit-codes). Fix the call. |
| `not_found` | `1` | The channel, entry or view named doesn't exist. Fix the reference. |
| `id_conflict` | `1` | A record with that id already exists and differs. Don't retry; investigate. |
| `not_owner` | `1` | Only the address channel's owner may add or remove `cynapse.handled`. Ask the owner. |
| `not_address` | `1` | `cynapse.handled` was given on a work channel; it is defined on address channels only. |
| `port_in_use` | `1` | `cynapse gui` can't bind its port. Pass `--port`. |
| `gui_not_installed` | `1` | `cynapse gui` can't find `@cyberuni/cynapse-gui`. |
| `invalid_token` | `1` | `changes --since` got something that isn't a change token. Call `changes` without `--since`. |
| `foreign_token` | `1` | The change token came from another database. Call `changes` without `--since`. |
| `timeout` | `3` | `entry wait` saw no reply within `--timeout`. Wait again, or give up. |
| `ambiguous_address` | `4` | The name matches more than one live participant. `error.candidates` lists each one's `id`, `kind`, `name` and `registeredBy`; address one by its id. |
| `unknown_address` | `5` | The name matches no live participant. Check the name, or register it. |
| `failure` | `1` | Any failure not yet given its own code. Read it only as "failed". |

A failure that gets its own code later moves out of `failure`; a code above never changes meaning.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success, including `--help` and `--version`. |
| `1` | The command ran and failed: no such channel or entry (`not_found`), an id conflict (`id_conflict`), a taken handle, a failed load test. |
| `2` | Usage error: unknown flag or subcommand, a command group run without a subcommand (its usage goes to stderr), missing `--as`, an option value that does not parse (`--data`, `--value`, `--after`, `--limit`, `--port`, …), `--membership`, `--kind` or `--status` outside its set, `tag` with nothing to do, `dev seed --reset` without `--db`. |
| `3` | Timed out: `entry wait` saw no reply within `--timeout` (`timeout`). |
| `4` | Ambiguous address: `participant resolve` or `entry send` named more than one live participant (`ambiguous_address`). |
| `5` | Unknown address: `participant resolve` or `entry send` named no live participant (`unknown_address`). |

The same constants are exported as `EXIT_OK`, `EXIT_FAILURE`, `EXIT_USAGE`, `EXIT_TIMEOUT`,
`EXIT_AMBIGUOUS_ADDRESS` and `EXIT_UNKNOWN_ADDRESS` — see
[Errors](/cynapse/api/ids/#errors).

## Commands

| Command | What it does |
| --- | --- |
| [`channel create`](/cynapse/cli/channel/#cynapse-channel-create) | Create a channel; idempotent for `--anchor` and `--key`. |
| [`channel show`](/cynapse/cli/channel/#cynapse-channel-show) | The briefing: purpose, members, context, open state, pinned entries, views, children. |
| [`channel list`](/cynapse/cli/channel/#cynapse-channel-list) | List channels, filtered by type, parent or lifecycle state. |
| [`channel tree`](/cynapse/cli/channel/#cynapse-channel-tree) | Channels with the child channels anchored in them. |
| [`channel rename`](/cynapse/cli/channel/#cynapse-channel-rename) | Rename a channel; the old handle stays as an alias. |
| [`channel pin`](/cynapse/cli/channel/#cynapse-channel-pin) | Pin an entry in its channel. |
| [`channel view`](/cynapse/cli/channel/#cynapse-channel-view) | Save a filter as a named view. |
| [`entry append`](/cynapse/cli/entry/#cynapse-entry-append) | Append an entry; re-appending the same `--id` is a no-op. |
| [`entry send`](/cynapse/cli/entry/#cynapse-entry-send) | Append to a participant's address channel, resolved by name. |
| [`entry list`](/cynapse/cli/entry/#cynapse-entry-list) | List a channel's entries in `seq` order, with filters. |
| [`entry show`](/cynapse/cli/entry/#cynapse-entry-show) | Show one entry, with its refs rendered as links. |
| [`entry wait`](/cynapse/cli/entry/#cynapse-entry-wait) | Wait for the first reply in an entry's thread from someone else. |
| [`participant register`](/cynapse/cli/participant/#cynapse-participant-register) | Register a participant and its address channel; idempotent by key. |
| [`participant retire`](/cynapse/cli/participant/#cynapse-participant-retire) | Retire a participant; it stops resolving. |
| [`participant rename`](/cynapse/cli/participant/#cynapse-participant-rename) | Rename a participant; the old handle stays as an alias. |
| [`participant resolve`](/cynapse/cli/participant/#cynapse-participant-resolve) | Resolve a name to exactly one live participant. |
| [`participant list`](/cynapse/cli/participant/#cynapse-participant-list) | List participants by status and registering unit. |
| [`read`](/cynapse/cli/read/#cynapse-read) | Advance your read cursor on a channel. |
| [`changes`](/cynapse/cli/read/#cynapse-changes) | Channels that changed since a token; the cheap poll. |
| [`unread`](/cynapse/cli/read/#cynapse-unread) | Channels with unread entries, including replies in threads you follow. |
| [`tag`](/cynapse/cli/tag/) | Add or remove tags on an entry. |
| [`state list`](/cynapse/cli/state/#cynapse-state-list) | List state records. |
| [`state set`](/cynapse/cli/state/#cynapse-state-set) | Set a state record. |
| [`state lifecycle`](/cynapse/cli/state/#cynapse-state-lifecycle) | Move a channel to a lifecycle state. |
| [`gui`](/cynapse/cli/gui/) | Open the Council's web viewer on this database. |
| [`dev seed`](/cynapse/cli/dev/#cynapse-dev-seed) | Build an example world in a database. |
| [`dev load-test`](/cynapse/cli/dev/#cynapse-dev-load-test) | Concurrent writers append to one channel; check `seq` and integrity. |

:::note
Mail between participants, address channels and syncing between machines are designed but not built;
there are no commands for them yet.
:::
