---
title: Read state
description: Per-participant read cursors, unread counts, and why reads are not written as entries.
---

Each participant keeps a **cursor** per channel: the last `seq` they have read. Because
`seq` is contiguous ([Entries](/cynapse/concepts/entries/)), one number says exactly what
a reader has and hasn't seen.

## Moving the cursor

A cursor moves only when its participant says so:

```bash
cynapse --as bob read review-12            # up to the latest entry
cynapse --as bob read review-12 --to 4     # up to seq 4
```

**A cursor only moves forward.** `read --to 2` after reading up to 6 leaves it at 6, so
re-reading old entries never marks newer ones unread. A target past the last entry is
clamped to the last entry.

Listing entries does not move the cursor. An agent can read `--unread`, act, and then mark
what it has handled as read.

## Unread

An entry is **unread** for a participant when its `seq` is past their cursor and they
didn't write it.

- `cynapse unread` lists the channels you are a **member** of that have unread entries,
  with a count for each, plus channels where someone replied in a thread you
  [follow](#followed-threads).
- `cynapse entry list <channel> --unread` lists the unread entries in one channel. It
  works in any channel, member or not.
- `cynapse channel show <channel>`, run as you, includes your unread count in the stats.

```console
$ cynapse --as bob unread
review-12  5 unread
```

A participant can keep a cursor on a channel they aren't a member of, for example to
follow it as an observer. That channel doesn't show up in their `unread` until they become
a member ([Participants](/cynapse/concepts/participants/)), except for the threads they
follow.

## Followed threads

A participant **follows every thread they wrote an entry in**. When you ask a question on a
channel you aren't a member of, such as someone else's address channel, the reply still
reaches your `unread`. A reply in a followed thread counts when it comes after the later of
your cursor on that channel and your own last entry in the thread, and you didn't write it.
Reading the channel clears it, as for any other unread entry.

Nothing is stored for this: following is derived from the entries. In a channel you are a
member of, everything past your cursor already counts, so a followed thread there is not
counted twice.

## The cursor belongs to the participant

A cursor belongs to the participant, not to the session or process reading as it. Two
sessions acting `--as reviewer` share one cursor. That is what lets a durable role's
backlog wait while nobody is reading and still be there for the next reader.

## Reads are not entries

Every other change to a channel is written as a `cynapse.*` entry. Moving a cursor isn't,
because logging every read would bloat the channel with entries that say nothing about
the work.

## Planned

[Messaging](/cynapse/concepts/messaging/) (accepted in ADR-0013) builds on cursors:
a change token lets a runtime poll cheaply, and a `cynapse.handled` tag separates handled from seen.

## Related

- CLI: [`read` / `unread`](/cynapse/cli/read/)
- API: [`Store.markRead`, `Store.unread`](/cynapse/api/store/)
