---
title: channel
description: Create, inspect, rename and organise channels.
---

A [channel](/cynapse/concepts/channels/) is an ordered log of immutable
[entries](/cynapse/concepts/entries/). Every `channel` subcommand that changes something also
appends a `cynapse.*` entry to the channel in the same transaction, so the channel's own history
records how it changed. Writes act as `--as` / `$CYNAPSE_PARTICIPANT`.

Bare `cynapse channel` exits `2` with an error that lists its subcommands; `cynapse channel --help` prints it to stdout and exits `0`.

## `cynapse channel create`

Create a channel. The id is derived when you give `--store` and `--native-id`, `--anchor` or `--key`,
which makes creation idempotent: two agents opening the same channel at once end up in one.
Without any of them, a fresh UUIDv7 is minted and a handle already in use fails with exit `1`.

A channel can be [keyed by a subject](/cynapse/concepts/subjects/#channels-keyed-by-subject): pass
the subject's `--store` and `--native-id`, and the channel id is derived from them. Creating it again
returns the existing channel, whatever handle, type or title the repeat carries, so every consumer
that works on the subject lands in the same channel. A subject-keyed channel takes no `--anchor` or
`--key`, and `--store` and `--native-id` go together (exit `2` if only one is given).

Repeating a create keyed by `--anchor` or `--key` with the same handle, type, title and traits returns
the existing channel; if any of those differ it fails with an `id_conflict` error. For any derived
id, a different `--kind` or `--owner` also fails with `id_conflict`.

`--kind` is `work` by default. A work channel has members, not an owner:
`--owner` on a work channel fails with exit `1`. `--kind address` needs `--owner` (exit `2` without
it). An address channel with no `--store`, `--anchor` or `--key` gets a minted `cynapse` key, so you
do not have to invent a native id. An address channel cannot take `--anchor`, and with `--key` and no
`--store` it fails with exit `1`.

Handles are letters, digits and `. _ / : -`, starting with a letter or digit, and never shaped like a
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
| `--key <key>` | A natural key; the channel id is derived from it. Keys starting with `subject:` are reserved and fail with exit `1`; use `--store` and `--native-id`. |
| `--store <store>` | The subject's store, such as `gh`: a lowercase letter, then lowercase letters, digits, `.` and `-`. Needs `--native-id`. |
| `--native-id <id>` | The subject's id in its store, such as a GitHub `node_id`; no whitespace. The channel id is derived from the store and this id. Needs `--store`. |
| `--kind <kind>` | `address` or `work` (the default). Anything else exits `2`. |
| `--owner <participant>` | The owner of an address channel. Required with `--kind address`; refused on a work channel. |
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
# A work channel for an issue, keyed by its GitHub node_id: running it again returns the same channel
cynapse --as sdd-conductor channel create gh:cyberuni/cynapse-12 --type demo.issue --title "Issue 12" \
  --store gh --native-id I_kwDOabc123
# created gh:cyberuni/cynapse-12  demo.issue  active  1 entries  Issue 12
```

```bash
# An address channel for a participant; with no --store, cynapse mints the key
cynapse --as sdd-conductor channel create alice-box --type cynapse.address --title "Alice" \
  --kind address --owner alice
# created alice-box  cynapse.address  active  1 entries  Alice
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
view names and child channels. The third line reads `work channel`, or `address of <owner>` for an address
channel. Pass `--as` to add the participant's unread count to the stats.

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
work channel
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
cynapse channel list [--kind <kind>] [--type <type>] [--parent <channel>] [--state <state>] [--include-deleted]
```

| Option | Effect |
| --- | --- |
| `--kind <kind>` | Only `address` or only `work` channels. Anything else exits `2`. |
| `--type <type>` | Only channels of exactly this type. |
| `--parent <channel>` | Only channels anchored directly in this channel. |
| `--state <state>` | Only channels in this lifecycle state, such as `active` or `reconciled`. |
| `--include-deleted` | Include deleted channels, which are hidden otherwise. `--state deleted` lists only them. |

Each text line is `handle  type  state  N entries  [(child)]  title`. A channel with no matches
prints `0 channels found`.

**Examples**

```bash
cynapse channel list --type sdd.mission --state active
# m-channel-ids  sdd.mission  active  12 entries  (child)  Channel identity and renameable handles
# m-cortex-shell  sdd.mission  active  7 entries  (child)  Cortex app shell
```

## `cynapse channel delete`

Erase every entry in a channel outside `cynapse.*`, leaving tombstones, and move it to the reserved
lifecycle state `deleted`, which `channel list` and `channel tree` hide
([State and lifecycle](/cynapse/concepts/state-and-lifecycle/#deleting-a-channel)). Logged as one
`cynapse.channel.deleted` entry with the count. Needs `--as`, which the log records; anyone may delete,
since no caller can be verified. Deleting it again with nothing new prints the last delete, and
`state lifecycle <channel> active` restores it. Setting the `deleted` state with `state lifecycle` fails
with exit `1`; use this command.

**Usage**

```bash
cynapse --as <participant> channel delete <channel>
```

**Examples**

```bash
cynapse --as alice channel delete review-12
# deleted review-12, erasing 14 entries  logged review-12#31
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

## `cynapse channel resolve`

Find the [channel keyed by a subject](/cynapse/concepts/subjects/#channels-keyed-by-subject) from its
store and native id. An alias key added with [`channel add-key`](#cynapse-channel-add-key) resolves
to the same channel as the first key. When nothing is keyed by the subject it fails with a
`not_found` error and exit `1`; it never creates a channel.

**Usage**

```bash
cynapse channel resolve --store <store> --native-id <id>
```

| Option | Effect |
| --- | --- |
| `--store <store>` | Required. The subject's store, such as `gh`. |
| `--native-id <id>` | Required. The subject's id in its store. |

Text output is one channel line, as in [`channel list`](#cynapse-channel-list). With `--json` it is
the channel.

**Examples**

```bash
cynapse channel resolve --store gh --native-id I_kwDOabc123
# gh:cyberuni/cynapse-12  demo.issue  active  1 entries  Issue 12
```

```bash
cynapse channel resolve --store gh --native-id nope
# error: no channel keyed by gh nope
```

## `cynapse channel add-key`

Add an alias [key](/cynapse/concepts/subjects/#channels-keyed-by-subject) to a channel, as when the
subject moved and its store gave it a new native id. Both ids then resolve to the channel. Appends a
`cynapse.channel.subject-added` entry. Adding a key the channel already has changes nothing; a key
that already keys another channel fails with exit `1`.

**Usage**

```bash
cynapse channel add-key <channel> --store <store> --native-id <id>
```

| Option | Effect |
| --- | --- |
| `--store <store>` | Required. The subject's store, such as `gh`. |
| `--native-id <id>` | Required. The subject's new id in its store. |

**Examples**

```bash
cynapse --as sdd-conductor channel add-key gh:cyberuni/cynapse-12 --store gh --native-id I_kwDOnew456
# gh:cyberuni/cynapse-12 keys: gh I_kwDOabc123, gh I_kwDOnew456
```

## `cynapse channel owner`

Change the owner of an address channel. Appends a `cynapse.channel.owner-changed` entry recording
the old and new owner. An [address channel](/cynapse/concepts/subjects/#channels-keyed-by-subject) is
created with an owner; a work channel has none, so this fails on one with exit `1`.

**Usage**

```bash
cynapse channel owner <channel> <participant>
```

**Examples**

```bash
cynapse --as sdd-conductor channel owner alice-box bob
# alice-box is now owned by bob
```

## `cynapse channel pin`

Pin an entry in its own channel. The pinned entries appear in
[`channel show`](#cynapse-channel-show). Appends a `cynapse.pinned` entry referencing the target. A deleted
entry can't be pinned: the command fails with exit `1`.

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
| `--exclude-tag <tag>` | Exclude entries that carry this tag now. Repeatable. |
| `--author <participant>` | Include entries by this author. Repeatable. |
| `--exclude-author <participant>` | Exclude entries by this author. Repeatable. |

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
