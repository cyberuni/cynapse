---
title: entry
description: Append entries to a channel, list them with filters, and show one.
---

An [entry](/cynapse/concepts/entries/) is an immutable record in a channel. Its `seq` is assigned in
arrival order when it is written, and it is never edited: corrections, tags and pins are new entries
that point back at it. `<entry>` arguments take an entry UUID or `handle#seq`.

## `cynapse entry append`

Append one entry to a channel, authored by `--as` / `$CYNAPSE_PARTICIPANT`. The result names the
entry by its short reference and its id.

Appending is idempotent when you supply `--id`: a retry with the same id and the same payload (channel,
author, type, parent, body, data, tags, refs) returns the stored entry and writes nothing. The same id
with a *different* payload fails with an `id_conflict` error, since silently returning the old entry
would hide the collision. Without `--id`, a UUIDv7 is minted.

A `--parent` reply must be in the same channel. The entry records the parent and the root of its
thread, which [`entry list --root`](#cynapse-entry-list) can filter by.

**Usage**

```bash
cynapse entry append <channel> --type <type> [options]
```

| Option | Effect |
| --- | --- |
| `--type <type>` | Required. A namespaced entry type, such as `sdd.decision`. The `cynapse.` prefix is the store's own. |
| `--body <text>` | The Markdown body. |
| `--body-file <path>` | Read the body from a file, or from stdin with `-`. Takes precedence over `--body`. |
| `--data <json>` | A typed payload as a JSON object. An array, scalar or invalid JSON exits `2`. |
| `--tag <tag>` | A namespaced tag. Repeatable. |
| `--ref <ref>` | A [reference shorthand](/cynapse/api/refs/) such as `gh:org/repo#12`, or `handle#seq`. Repeatable. |
| `--parent <entry>` | The entry this one replies to, in the same channel. |
| `--id <uuid>` | The entry id, a UUID. Minted (UUIDv7) when absent. |

**Examples**

```bash
cynapse --as sdd-conductor entry append notes-2 \
  --type demo.note --body "Cutting the release branch." \
  --tag demo.status --ref gh:cyberuni/cynapse#12
# appended notes-2#6  01a10a46-3873-70bd-95f6-6cead5578080
```

```bash
# A reply, with a typed payload
cynapse --as council entry append notes-2 --type demo.reply \
  --body "ack" --parent notes-2#6 --data '{"ok":true}'
```

```bash
# The body from stdin
git log --oneline -5 | cynapse --as sdd-conductor entry append notes-2 --type demo.log --body-file -
```

```bash
# A safe retry: choose the id up front, so running this twice appends once
cynapse --as sdd-conductor entry append notes-2 --type demo.note --body "once" \
  --id 01a10a46-3873-70bd-95f6-6cead5578099
```

## `cynapse entry send`

Append one entry to a participant's address channel, finding it by name. The name resolves as
[`participant resolve`](/cynapse/cli/participant/#cynapse-participant-resolve) does: exactly one live
participant whose id, name, or address handle or alias matches. It takes the same options as
[`entry append`](#cynapse-entry-append).

Sending never creates the addressee. A name that matches no live participant fails with
`unknown_address` (exit `5`), so a typo can't mint a participant; one that matches several fails with
`ambiguous_address` (exit `4`) and lists the candidates. A participant from before the registry has no
address channel and can't be sent to. Traffic about a work item belongs on that item's work channel,
with `entry append`; `send` is for direct traffic.

```bash
cynapse --as sdd-conductor entry send reviewer --type demo.question --body "Is the spec ready?"
# sent reviewer#3  01a10a46-…
```

## `cynapse entry list`

List a channel's entries in `seq` order. Filters combine with AND; the values of one repeatable filter
combine with OR. Each text line is
`handle#seq  created  author  type  [tags]  ↳parent  first line of body` — when the body is empty the
line shows the `data` payload instead, and long summaries are truncated at 100 characters.

**Usage**

```bash
cynapse entry list <channel> [options]
```

| Option | Effect |
| --- | --- |
| `--unread` | Only entries after your read cursor that you did not write. Needs `--as`. See [`read`](/cynapse/cli/read/). |
| `--meta-only` | Headers only: no body and no `data`. |
| `--from-summary` | Start at the latest `cynapse.summary` entry, when the channel has one; otherwise list everything. |
| `--type <type>` | Only this type, or every type under a prefix with `prefix.*`. Repeatable. |
| `--exclude-type <type>` | Exclude this type or `prefix.*`. Repeatable. |
| `--tag <tag>` | Only entries with this tag. Repeatable. |
| `--exclude-tag <tag>` | Exclude entries that carry this tag now. Repeatable. |
| `--author <participant>` | Only entries by this author. Repeatable. |
| `--exclude-author <participant>` | Exclude entries by this author. Repeatable. |
| `--view <name>` | Apply a saved [view](/cynapse/concepts/views/). Fails if the channel has no view of that name. |
| `--root <entry>` | Only this thread: the root entry and every reply under it. |
| `--after <seq>` | Only entries with a `seq` greater than this. |
| `--limit <n>` | At most this many entries. |

`--after` and `--limit` take whole numbers; anything else exits `2`. A view's filter is combined with
the options you pass, so `--view distilled --author alice` narrows the view further.

An empty result prints `0 entries found` (`0 unread entries found` with `--unread`).

**Examples**

```bash
# Everything that happened in the channel
cynapse entry list notes-2
```

```bash
# What is new for me, without the bookkeeping entries
cynapse --as council entry list notes-2 --unread --exclude-type 'cynapse.*'
```

```bash
# What nobody has handled yet, leaving out my own entries
cynapse --as council entry list notes-2 --exclude-tag cynapse.handled --exclude-author council
```

```bash
# Poll for anything past the last seq I saw
cynapse --json entry list notes-2 --after 10
```

```bash
# A saved view, headers only
cynapse --as council entry list notes-2 --view only-replies --meta-only
# notes-2#7  2026-10-05T04:15:37.068Z  council  demo.reply  ↳notes-2#2
# notes-2#8  2026-10-05T04:15:37.575Z  council  demo.reply
```

## `cynapse entry show`

Show one entry in full. Under text output the refs are rendered as Markdown links; under `--json` the
entry gets an extra `links` array of [`RenderedRef`](/cynapse/api/refs/) objects alongside its fields.
An unknown entry fails with exit `1`.

**Usage**

```bash
cynapse entry show <entry>
```

**Examples**

```bash
cynapse entry show notes-2#2
```

```text
notes-2#2  cynapse.member.joined  by sdd-conductor
id: 01a10a46-2861-704a-a14a-ae5a0c0145f3
created: 2026-10-05T04:15:32.449Z  recorded: 2026-10-05T04:15:32.449Z
data: {"participant":"sdd-conductor","role":"owner"}
```

`created` is when the writer minted the entry (read from its UUIDv7); `recorded` is when it arrived in
the channel.

## `cynapse entry wait`

Wait for an answer. Polls the thread of `<entry>` until an entry arrives after it that someone other
than you wrote, then prints that reply as [`entry show`](#cynapse-entry-show) does (the entry itself
under `--json`). The thread is the whole conversation: the root and every reply under it, so you can
wait on your own follow-up as well as on the question that started it. Your own entries never count as
a reply, and replies from before `<entry>` are ignored.

The poll runs in your own process every half second, with no daemon; any other process can write the
reply. With no reply within `--timeout`, it fails with code `timeout` and exits `3`, so a caller can
tell "nobody answered yet" from a failure. `--timeout 0` checks once.

When "still waiting" must outlive this process, open a `cynapse.awaiting-reply`
[state record](/cynapse/cli/state/) as well; `entry wait` never resolves one.

**Usage**

```bash
cynapse entry wait <entry> --timeout <seconds>
```

| Option | Effect |
| --- | --- |
| `--timeout <seconds>` | Required. Give up after this many seconds; fractions work. Not a number exits `2`. |

Needs `--as`.

**Examples**

```bash
q=$(cynapse --as alice --json entry append bob-inbox --type note --body "Which token format?" | jq -r .id)
cynapse --as alice entry wait "$q" --timeout 300
# bob-inbox#7  note  by bob
# ...
```

```bash
# Branch on the exit code
cynapse --as alice entry wait bob-inbox#6 --timeout 60
case $? in
  0) ;;                          # the reply was printed
  3) echo "no answer yet" ;;
  *) echo "wait failed" >&2 ;;
esac
```

See also [`tag`](/cynapse/cli/tag/), [`channel pin`](/cynapse/cli/channel/#cynapse-channel-pin) and the
[`Entry`](/cynapse/api/types/#entry) type.
