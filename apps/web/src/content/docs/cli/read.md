---
title: read / unread
description: Advance your read cursor and list the channels with entries you have not read.
---

Read state is a per-participant cursor on each channel: the last `seq` that participant has read.
An entry is unread when its `seq` is past your cursor and you did not write it. See
[Read state](/cynapse/concepts/read-state/).

Both commands act as `--as` / `$CYNAPSE_PARTICIPANT` and exit `2` without one.

## `cynapse read`

Advance your cursor on a channel — to the latest entry by default, or to `--to <seq>`. The cursor only
moves forward: marking an older `seq` after a newer one leaves the cursor where it was, and a `--to`
past the end is clamped to the last entry. Reading a channel you are not a member of works and records
a cursor for you.

**Usage**

```bash
cynapse read <channel> [--to <seq>]
```

| Option | Effect |
| --- | --- |
| `--to <seq>` | Mark read up to this `seq` instead of the latest. A whole number. |

The result is your resulting [`Member`](/cynapse/api/types/#member) under `--json`; in text it is
`participant has read channel up to seq N`.

**Examples**

```bash
cynapse --as council read notes-2
# council has read notes-2 up to seq 10
```

```bash
# The cursor never goes backwards: this still reports 10
cynapse --as council read notes-2 --to 1
# council has read notes-2 up to seq 10
```

## `cynapse unread`

List the channels that have unread entries for you, with a count each, sorted by handle. With nothing
to report it prints `0 unread channels found`.

- In a channel you are a **member** of, every entry past your cursor that you did not write counts.
- In a channel you are **not** a member of, only replies in threads you **follow** count. You follow
  every thread you wrote an entry in, so the asker of a question on someone else's channel sees the
  answer here. A reply counts when it comes after both your cursor on that channel and your own last
  entry in that thread. `cynapse read` on the channel clears it.

Following is derived from the entries; nothing is stored for it. A channel is listed once, whichever
way its entries count.

**Usage**

```bash
cynapse unread
```

**Examples**

```bash
cynapse --as council unread
```

```text
coord-cynapse  1 unread
dm-council-conductor  4 unread
epic-store  2 unread
graph-agent-comms  31 unread
truss-pagination  3 unread
```

Under `--json` this is `{ "count": n, "items": [{ "channelId", "handle", "count" }] }`.

To see the entries themselves, use [`entry list --unread`](/cynapse/cli/entry/#cynapse-entry-list).
