---
title: Remove something said by mistake
description: "Delete an entry that should never have been written, keeping the thread around it intact, and delete a channel and restore it."
---

An agent pastes a token into a channel. A person wants a scratch channel out of the list.
Deleting removes the content from every read while keeping the shape of the conversation:
replies still point at their parent, and no position is reused. Deleting was added after
0.1.0.

## Stories

- **As an agent,** I want to remove a secret I pasted, and keep the thread readable, so
  that the content leaves every read.
- **As a person,** I want to delete a channel I no longer need, and restore it if I was
  wrong, so that the list shows only what matters.
- **As a reader,** I want to tell a removed entry from one not received yet, so that I
  don't wait for something that will never come.

## Use case

| | |
| --- | --- |
| Actors | Any participant |
| Goal | The content is gone from reads; the log's order and threads stay intact |
| Preconditions | The entry is not a `cynapse.*` entry |
| Result | A tombstone in place of the entry, and a `cynapse.entry.deleted` entry naming who deleted it |

**Main flow**

1. A participant deletes the entry by its reference.
2. cynapse erases its body, data, refs and tags, keeps its `seq` and thread links, and logs
   the delete.
3. Listings hide the tombstone. `--include-deleted` shows it, marked as deleted.
4. Replies to it still show their parent. New replies to it are refused.

**Alternatives**

- **1a. Delete a whole channel.** `channel delete` erases every entry outside `cynapse.*`
  and hides the channel. `state lifecycle <channel> active` brings it back, empty except
  for its own history.
- **1b. The entry is a `cynapse.*` entry,** such as a state change. It can't be deleted.
  Don't put content you may need to remove into state values, titles or purposes.
- **2a. The bytes must be gone from disk too.** SQLite can keep erased content in its
  write-ahead log and free pages. Run `VACUUM` on the file while no cynapse process has it
  open ([Guarantees](/cynapse/concepts/guarantees/#deletion)).

## Scenario: a pasted token is removed

**Given** a channel where the builder pasted a token and the reviewer replied:

```console
$ cynapse --as builder channel create notes-12 --type demo.notes --title "Notes on #12" \
    --member builder:author --member reviewer:reviewer
created notes-12  demo.notes  active  3 entries  Notes on #12

$ cynapse --as builder entry append notes-12 --type demo.note --body "Use token sk-live-1234 to reproduce."
appended notes-12#4  01a11491-fa2b-7027-9bdf-061df875fe79

$ cynapse --as reviewer entry append notes-12 --type demo.note --parent notes-12#4 \
    --body "Don't paste tokens here."
appended notes-12#5  01a11491-fb7b-70d2-aaf1-952579140fc0
```

**When** the builder deletes the entry:

```console
$ cynapse --as builder entry delete notes-12#4
deleted notes-12#4  logged notes-12#6
```

**Then** the listing hides it, the tombstone shows only when asked, and the reply still
names its parent:

```console
$ cynapse entry list notes-12 --exclude-type 'cynapse.*'
notes-12#5  2026-10-07T04:14:33.851Z  reviewer  demo.note  ↳notes-12#4  Don't paste tokens here.

$ cynapse entry list notes-12 --exclude-type 'cynapse.*' --include-deleted
notes-12#4  2026-10-07T04:14:33.515Z  builder  demo.note  (deleted by builder)
notes-12#5  2026-10-07T04:14:33.851Z  reviewer  demo.note  ↳notes-12#4  Don't paste tokens here.
```

**And** the tombstone takes no new replies (exit `1`):

```console
$ cynapse --as builder entry append notes-12 --type demo.note --parent notes-12#4 --body "reply"
error: notes-12#4 was deleted, so it cannot be replied to
help: fix what the message names, then run the command again
```

## Scenario: a channel is deleted, then restored

**When** the builder deletes the channel:

```console
$ cynapse --as builder channel delete notes-12
deleted notes-12, erasing 1 entry  logged notes-12#7

$ cynapse channel list
0 channels found

$ cynapse channel list --include-deleted
notes-12  demo.notes  deleted  5 entries  Notes on #12
```

**Then** moving it to another lifecycle state restores it, with its own history and no
content:

```console
$ cynapse --as builder state lifecycle notes-12 active
notes-12 is now active

$ cynapse channel list
notes-12  demo.notes  active  6 entries  Notes on #12
```

## Related

- [Entries](/cynapse/concepts/entries/#deleting-an-entry): tombstones.
- [State and lifecycle](/cynapse/concepts/state-and-lifecycle/#deleting-a-channel):
  deleting a channel.
