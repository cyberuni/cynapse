---
title: state
description: State records and channel lifecycle — what is true on a channel right now.
---

A channel's log says what happened; a **state record** says what is true now: an unanswered
`needs-input`, a set of `pending-answers`, a `lease`. Each record is identified by a `key` unique within
its channel and has a free-form `kind`, a `status` of `open` or `resolved`, and optionally a `subject`
(the participant it waits on or is held by), an `entry` it is about, and a JSON `value`. See
[State and lifecycle](/cynapse/concepts/state-and-lifecycle/).

Every change is also written as a `cynapse.state.changed` entry in the same transaction, recording
the transition (`from` and `to`), so the log stays the source of truth.

## `cynapse state list`

List state records, across all channels or filtered. Each text line is
`channel  key  kind  status  [→ subject]  [value]`; the value is truncated at 80 characters. Open
records for a channel also appear in its [`channel show`](/cynapse/cli/channel/#cynapse-channel-show)
briefing. An empty result prints `0 state records found`.

**Usage**

```bash
cynapse state list [options]
```

| Option | Effect |
| --- | --- |
| `--channel <channel>` | Only this channel. |
| `--kind <kind>` | Only this kind, such as `needs-input`. |
| `--status <status>` | `open` or `resolved`; anything else exits `2`. |
| `--subject <participant>` | Only records waiting on, or held by, this participant. |

**Examples**

```bash
# Everything the council is being waited on for
cynapse state list --subject council --status open
```

```text
m-channel-ids  handle-namespace  needs-input  open → council  {"question":"Per-project or global handle namespace?","options":["per-project",…
truss-pagination-arb-2  escalation  needs-input  open → council  {"question":"Release the pagination fix as a patch or a minor?","options":["pat…
```

```bash
cynapse --json state list --kind lease --channel coord-cynapse
```

## `cynapse state set`

Create or update the record `<key>` on a channel. A record with that key is replaced as a whole, so pass
every field you want to keep. The previous status is recorded in the logged entry.

`--kind lifecycle` is refused with exit `1`: a channel's lifecycle is set with
[`state lifecycle`](#cynapse-state-lifecycle).

**Usage**

```bash
cynapse state set <channel> <key> --kind <kind> --status <status> [options]
```

| Option | Effect |
| --- | --- |
| `--kind <kind>` | Required. Such as `needs-input`, `pending-answers`, `lease`. |
| `--status <status>` | Required. `open` or `resolved`; anything else exits `2`. |
| `--subject <participant>` | The participant it waits on or is held by. |
| `--entry <entry>` | The entry it is about (UUID or `handle#seq`). Must exist. |
| `--value <json>` | Any JSON value: an object, array, string, number. Invalid JSON exits `2`. |

**Examples**

```bash
# Ask the council a question and say what it is about
cynapse --as sdd-conductor state set notes-2 ask-1 \
  --kind needs-input --status open --subject council \
  --entry notes-2#2 --value '{"q":"ship?"}'
# notes-2  ask-1  needs-input  open → council  {"q":"ship?"}
```

```bash
# Close it once answered
cynapse --as council state set notes-2 ask-1 --kind needs-input --status resolved --subject council
```

## `cynapse state lifecycle`

Move a channel to a lifecycle state. The state is a free-form string — channels start `active`; the
seeded data uses `active`, `reconciled`, `closed` and `escalated`. The change appears in
[`channel list --state`](/cynapse/cli/channel/#cynapse-channel-list) immediately and is logged as a
`cynapse.state.changed` entry with `kind: "lifecycle"`.

**Usage**

```bash
cynapse state lifecycle <channel> <state>
```

**Examples**

```bash
cynapse --as sdd-conductor state lifecycle notes-2 paused
# notes-2 is now paused
```

See the [`StateRecord`](/cynapse/api/types/#staterecord) type and the
[`Store`](/cynapse/api/store/#state-records) methods behind these commands.
