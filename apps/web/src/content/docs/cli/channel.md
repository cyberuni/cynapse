---
title: channel
description: Create, inspect, rename and organise channels.
---

A [channel](/cynapse/concepts/channels/) is an ordered log of immutable
[entries](/cynapse/concepts/entries/). Every `channel` subcommand that changes something also
appends a `cynapse.*` entry to the channel in the same transaction, so the channel's own history
records how it changed. Writes act as `--as` / `$CYNAPSE_PARTICIPANT`.

Bare `cynapse channel` prints no help; use `cynapse channel --help`.

## `cynapse channel create`

Create a channel. The id is derived when you give `--anchor` or `--key`, which makes creation
idempotent: two agents opening the same channel at once end up in one. Repeating the create with
the same derived id and the same handle, type, title and traits returns the existing channel; if any
of those differ it fails with an `id_conflict` error. Without `--anchor` or `--key`, a fresh UUIDv7
is minted and a handle already in use fails with exit `1`.

Handles are letters, digits and `. _ / -`, starting with a letter or digit, and never shaped like a
UUID (`#` is reserved for `handle#seq`).

**Usage**

```bash
cynapse channel create <handle> --type <type> --title <title> [options]
```

| Option | Effect |
| --- | --- |
| `--type <type>` | Required. A namespaced channel type, such as `sdd.mission`. Defined by the consumer. |
| `--title <title>` | Required. A human-readable title. |
| `--purpose <text>` | What the channel is for. |
| `--anchor <entry>` | Branch from this entry in a parent channel (UUID or `handle#seq`). The new channel's id is derived from the anchor. |
| `--key <key>` | A natural key; the channel id is derived from it. |
| `--member <participant:role>` | Add a member. Repeatable. Without `:role` the role is `member`. |
| `--context <ref>` | Add a context reference, such as `gh:org/repo#12`. Repeatable. |
| `--convention <name>` | A convention that applies, plugin-prefixed. Repeatable. |
| `--membership <kind>` | `open` (the default) or `fixed`. Anything else exits `2`. |
| `--wake` | Mark the channel as one whose members should be woken when an entry lands. |

`--wake` and `--membership` are stored as [traits](/cynapse/concepts/types-tags-traits/); nothing in
the CLI acts on them yet.

The new channel starts in the `active` lifecycle state. Each `--member` and `--context` becomes its
own entry after the `cynapse.channel.created` entry.

**Examples**

```bash
# A channel with two members and a context reference
cynapse --as sdd-conductor channel create demo-notes \
  --type demo.notes --title "Demo notes" --purpose "scratch" \
  --member sdd-conductor:owner --member council:reader \
  --context gh:cyberuni/cynapse#12
# created demo-notes  demo.notes  active  4 entries  Demo notes
```

```bash
# A channel with a natural key: the same key always names the same channel
cynapse --as sdd-conductor channel create dm-a-b --type cynapse.dm --title "a and b" --key dm:a:b
```

```bash
# A child channel anchored in an entry of its parent
cynapse --as sdd-conductor channel create review-1 --type demo.review --title "Review" \
  --anchor epic-store#3
```

## `cynapse channel show`

The agent's briefing for one channel: everything needed to start work, in one call. It lists the
channel's type, lifecycle state, title, purpose, anchor, aliases, members with their read cursors,
context (rendered as links), conventions, entry stats, open state records, pinned entries, saved
view names and child channels. Pass `--as` to add the participant's unread count to the stats.

**Usage**

```bash
cynapse channel show <channel>
```

**Examples**

```bash
cynapse --as council channel show truss-pagination
```

```text
truss-pagination  truss.mission  active
Fix pagination rounding
purpose: A developer fixed pagination in {code, test}; propagate the change through the artifact sets until the repo settles.
members: truss-ledger (run-ledger, read 0), wf-feature-delivery (workflow, read 0), council (approver, read 21)
context: [cyberuni/cyber-truss#41](https://github.com/cyberuni/cyber-truss/issues/41), [cyberuni/cyber-truss:fix/pagination](https://github.com/cyberuni/cyber-truss/tree/fix/pagination)
conventions: cyber-truss.run-ledger, cyber-truss.arbitration
stats: 25 entries, last seq 25, 3 unread
pinned:
  truss-pagination#21  2026-09-22T09:05:00.000Z  truss-ledger  truss.decision  [truss.criteria-v2]  ↳truss-pagination#20  Decided (criteria v2): the indicator shows the total page count and hides when the total is 1.
children:
  truss-pagination-arb-1  truss.arbitration  closed
  truss-pagination-arb-2  truss.arbitration  escalated
```

(Members trimmed for the page.) With `--json` the output is a [`Briefing`](/cynapse/api/types/#briefing).

## `cynapse channel list`

List channels, oldest first. With no options it lists all of them. Options combine with AND.

**Usage**

```bash
cynapse channel list [--type <type>] [--parent <channel>] [--state <state>]
```

| Option | Effect |
| --- | --- |
| `--type <type>` | Only channels of exactly this type. |
| `--parent <channel>` | Only channels anchored directly in this channel. |
| `--state <state>` | Only channels in this lifecycle state, such as `active` or `reconciled`. |

Each text line is `handle  type  state  N entries  [(child)]  title`. A channel with no matches
prints `0 channels found`.

**Examples**

```bash
cynapse channel list --type sdd.mission --state active
# m-channel-ids  sdd.mission  active  12 entries  (child)  Channel identity and renameable handles
# m-cortex-shell  sdd.mission  active  7 entries  (child)  Cortex app shell
```

## `cynapse channel tree`

Channels with the child channels anchored in them, nested by indentation. With no argument it starts
from every channel that has no parent; with a channel, from that one.

**Usage**

```bash
cynapse channel tree [channel]
```

**Examples**

```bash
cynapse channel tree epic-store
```

```text
epic-store  sdd.epic  active  8 entries  (child)  Persisted store
  m-seq-order  sdd.mission  reconciled  29 entries  (child)  Assign seq under the write lock
  m-channel-ids  sdd.mission  active  12 entries  (child)  Channel identity and renameable handles
```

Under `--json` the output is an array of [`ChannelTree`](/cynapse/api/types/#channeltree) nodes.

## `cynapse channel rename`

Give a channel a new handle. The old handle stays as an alias and keeps resolving, so existing
`handle#seq` references do not break. Appends a `cynapse.channel.renamed` entry. Renaming to the
channel's current handle changes nothing; a handle owned by another channel fails with exit `1`.

**Usage**

```bash
cynapse channel rename <channel> <handle>
```

**Examples**

```bash
cynapse --as sdd-conductor channel rename demo-notes notes-2
# renamed to notes-2 (aliases: demo-notes)
```

## `cynapse channel pin`

Pin an entry in its own channel. The pinned entries appear in
[`channel show`](#cynapse-channel-show). Appends a `cynapse.pinned` entry referencing the target.

**Usage**

```bash
cynapse channel pin <entry>
```

**Examples**

```bash
cynapse --as sdd-conductor channel pin notes-2#2
# pinned notes-2#2
```

## `cynapse channel view`

Save a filter as a named [view](/cynapse/concepts/views/) on a channel, then apply it with
[`entry list --view`](/cynapse/cli/entry/#cynapse-entry-list). Defining a view with an existing name
replaces its filter. With no filter options the view matches every entry. Appends a
`cynapse.view.defined` entry.

**Usage**

```bash
cynapse channel view <channel> <name> [options]
```

| Option | Effect |
| --- | --- |
| `--type <type>` | Include this entry type, or every type under a prefix with `prefix.*`. Repeatable. |
| `--exclude-type <type>` | Exclude this type or `prefix.*`. Repeatable. |
| `--tag <tag>` | Include entries carrying this tag. Repeatable; an entry matches if it has any of them. |
| `--author <participant>` | Include entries by this author. Repeatable. |

**Examples**

```bash
# Everything except the cynapse.* bookkeeping entries
cynapse --as sdd-conductor channel view notes-2 distilled --exclude-type 'cynapse.*'
```

```bash
# Only the council's replies
cynapse --as sdd-conductor channel view notes-2 only-replies --type demo.reply --author council
# view only-replies saved on notes-2
```

See also [`entry`](/cynapse/cli/entry/), [`state lifecycle`](/cynapse/cli/state/#cynapse-state-lifecycle),
and the [`Store`](/cynapse/api/store/#channels) methods behind these commands.
