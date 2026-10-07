---
title: read / unread / changes
description: Advance your read cursor, list the channels with entries you have not read, and poll for channels that changed.
---

Read state is a per-participant cursor on each channel: the last `seq` that participant has read.
An entry is unread when its `seq` is past your cursor and you did not write it. See
[Read state](/cynapse/concepts/read-state/).

`read` and `unread` act as `--as` / `$CYNAPSE_PARTICIPANT` and exit `2` without one. `changes` needs no identity.

## `cynapse read`

Advance your cursor on a channel to `--to <seq>`, or to the latest entry.

Without `--to`, the cursor moves to the channel's latest entry, including entries you have not listed.
An entry that lands after you list and before you run `read` is marked read unseen. Pass `--to <seq>` with
the last entry you actually processed.

The cursor only moves forward: marking an older `seq` after a newer one leaves the cursor where it was, and a `--to`
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
  `cynapse.*` metadata entries count too: a tag added later is a `cynapse.label` entry and counts as unread.
- In a channel you are **not** a member of, only replies in threads you **follow** count. You follow
  every thread you wrote an entry in, so the asker of a question on someone else's channel sees the
  answer here. A reply counts when it comes after both your cursor on that channel and your own last
  entry in that thread. `cynapse read` on the channel clears it.

Following is derived from the entries; nothing is stored for it. A channel is listed once, whichever
way its entries count.

A registered participant owns its address channel and is a member of it with role `owner`, so direct messages
to it appear in its own `unread`. Read them with [`entry list <handle> --unread`](/cynapse/cli/entry/#cynapse-entry-list).

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
epic-viewer  5 unread
feed-cynapse  2 unread
graph-agent-comms  31 unread
m-channel-ids  5 unread
m-cortex-shell  7 unread
truss-pagination  3 unread
truss-pagination-arb-2  16 unread
```

Under `--json` this is `{ "count": n, "items": [{ "channelId", "handle", "count" }] }`.

To see the entries themselves, use [`entry list --unread`](/cynapse/cli/entry/#cynapse-entry-list).

## `cynapse changes`

List the channels whose last `seq` moved since a change token, and print a new token to pass next
time. Without `--since` it lists every channel. This is the cheap poll a runtime runs for its sessions:
call `unread` or `entry list` only on the channels it returns. Every append moves a channel, the
`cynapse.*` metadata entries included; reading does not. It needs no `--as`.

The token is opaque and belongs to one store. It is not an order of entries: don't compare, sort or
merge tokens. A token from another database fails with `foreign_token`, and one that isn't a token
fails with `invalid_token`; call `changes` without `--since` to start over. cynapse never wakes anyone;
deciding whom to wake, from these changes and the channel's `wake` trait, is the runtime's job.

**Usage**

```bash
cynapse changes [--since <token>]
```

| Option | Effect |
| --- | --- |
| `--since <token>` | Only channels that changed after this token, from an earlier `changes`. |

**Examples**

```bash
cynapse changes --since cyn1.ZjBh...
```

```text
coord-cynapse  seq 14
epic-store  seq 9
token: cyn1.ZjBh...
```

With nothing changed it prints `0 changed channels found` and the token. Under `--json` this is
`{ "token", "count": n, "items": [{ "channelId", "handle", "lastSeq" }] }`, and an empty result is
`{ "count": 0, "entity": "changed channels", "items": [], "token" }`.
