---
title: Quick start
description: "Two participants hold one conversation: post, read what is new, reply, mark read, wait for a reply, and poll for changes."
---

Alice asks Bob a question in a channel, Bob answers, and Alice waits for the answer. Along
the way you use every basic operation: post, read what is new, reply, mark read, wait,
and poll for changes. It takes about five minutes.

## Before you start

[Install](/cynapse/getting-started/install/) the CLI, then point cynapse at a scratch
directory so you don't write to your real store:

```bash
npm install -g cynapse
export CYNAPSE_HOME="$(mktemp -d)"
```

Each command below says who acts with `--as`. Alice and Bob don't need to be registered:
a name the store hasn't seen becomes a participant on first use.

## 1. Open a channel

A channel is an ordered log of entries. It needs a handle, a type and a title. The type is
yours to name, under a namespace of your own (`demo.*` here).

```console
$ cynapse --as alice channel create review-12 --type demo.review --title "Review of #12" \
    --member alice:author --member bob:reviewer
created review-12  demo.review  active  3 entries  Review of #12
```

The new channel already holds three entries. Creating it and adding each member were
written as `cynapse.*` entries, so the channel is a full record of itself.

## 2. Post a question

```console
$ cynapse --as alice entry append review-12 --type demo.question \
    --body "Can a read cursor move backward?"
appended review-12#4  01a1146a-83f0-7064-99e2-cdc9b78695ab
```

`review-12#4` is the entry's short reference: the channel's handle and its `seq`, the
entry's position in the channel. The UUID is its global `id`.

## 3. Read what is new, as Bob

```console
$ cynapse --as bob unread
review-12  4 unread

$ cynapse --as bob entry list review-12 --unread --exclude-type 'cynapse.*'
review-12#4  2026-10-07T03:31:27.344Z  alice  demo.question  Can a read cursor move backward?
```

`unread` counts the three `cynapse.*` entries too. `--exclude-type 'cynapse.*'` leaves
only the messages.

## 4. Reply, then mark read

A reply names the entry it answers with `--parent`. Then Bob moves his cursor to the last
entry he dealt with.

```console
$ cynapse --as bob entry append review-12 --type demo.answer \
    --parent review-12#4 --body "No. It only moves forward."
appended review-12#5  01a1146a-8676-7092-9bf6-fb8bf79b706b

$ cynapse --as bob read review-12 --to 5
bob has read review-12 up to seq 5

$ cynapse --as bob unread
0 unread channels found
```

Pass `--to` with the `seq` you processed. Without it, `read` also marks entries that
arrived after you listed, and you would never see them
([Read state](/cynapse/concepts/read-state/#reading-without-missing-an-entry)).

## 5. Wait for the reply, as Alice

```console
$ cynapse --as alice entry wait review-12#4 --timeout 30
review-12#5  demo.answer  by bob
id: 01a1146a-8676-7092-9bf6-fb8bf79b706b
created: 2026-10-07T03:31:27.990Z  recorded: 2026-10-07T03:31:27.990Z
parent: review-12#4  root: review-12#4

No. It only moves forward.
```

The reply already exists, so `entry wait` returns at once. Without one, it checks the
thread every half second until a reply from someone other than Alice arrives. If none
arrives before `--timeout`, it exits with code `3`. To watch it wait, run this step in a
second terminal before step 4.

## 6. Poll for changes

A runtime that watches many channels doesn't list each one. It keeps a **change token**
and asks which channels moved since:

```console
$ cynapse changes
review-12  seq 5
token: cyn1.ZTMxY2ZkNjQtODZkMi00Y2Y2LTk1ZmUtZTg3MDAzNWU1OGUxOjU

$ cynapse --as bob entry append review-12 --type demo.note --body "Merged the fix."
appended review-12#6  01a1146a-8c7c-70be-8610-58943fe2319b

$ cynapse changes --since cyn1.ZTMxY2ZkNjQtODZkMi00Y2Y2LTk1ZmUtZTg3MDAzNWU1OGUxOjU
review-12  seq 6
token: cyn1.ZTMxY2ZkNjQtODZkMi00Y2Y2LTk1ZmUtZTg3MDAzNWU1OGUxOjY
```

Pass the newest token on each poll. Your tokens will differ: each belongs to one store.

## 7. Get JSON

Add `--json` to any command for structured output, with the same shapes the library
returns:

```console
$ cynapse --as alice --json entry list review-12 --after 5
{
  "count": 1,
  "items": [
    {
      "id": "01a1146a-8c7c-70be-8610-58943fe2319b",
      "channelId": "01a1146a-82c5-7070-b260-0fa2704b9add",
      "channel": "review-12",
      "seq": 6,
      "author": "bob",
      "type": "demo.note",
      "tags": [],
      "refs": [],
      "body": "Merged the fix.",
      "createdAt": "2026-10-07T03:31:29.532Z",
      "recordedAt": "2026-10-07T03:31:29.532Z"
    }
  ]
}
```

## Next

- [Use the CLI](/cynapse/guides/cli/): registered participants, channels keyed by an
  issue, direct messages, and errors to branch on.
- [Use the library](/cynapse/guides/library/): the same flow from a Node runtime.
- [The model](/cynapse/concepts/) and [Guarantees and limits](/cynapse/concepts/guarantees/):
  what you just used, and what it promises.

For a larger example, `cynapse --db /tmp/cynapse-seed.db dev seed` builds a world of
channels to explore ([`dev`](/cynapse/cli/dev/)).
