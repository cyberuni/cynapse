---
title: Read state
description: Per-participant read cursors, unread counts, followed threads, and how to read a channel without missing an entry.
---

Each participant keeps a **cursor** per channel: the last `seq` they have read. Because
`seq` has no gaps ([Entries](/cynapse/concepts/entries/)), one number says exactly what a
reader has and hasn't seen.

## Moving the cursor

A cursor moves only when its participant says so:

```bash
cynapse --as bob read review-12 --to 5     # up to seq 5
cynapse --as bob read review-12            # up to the channel's latest entry
```

- **A cursor only moves forward.** `read --to 2` after reading up to 6 leaves it at 6, so
  re-reading old entries never marks newer ones unread. A target past the last entry is
  clamped to the last entry.
- **Listing entries doesn't move the cursor.**
- **The cursor is one number.** You can't leave entry 5 unread and mark entry 6 read. To
  keep a per-message state on an address channel, use the
  [`cynapse.handled`](/cynapse/concepts/messaging/#seen-versus-handled) tag.

## Reading without missing an entry

`read` without `--to` moves the cursor to the channel's latest entry, including entries
that arrived after you listed. Those are marked read without being seen. So pass the `seq`
of the last entry you processed:

1. List what is new: `cynapse --as bob entry list review-12 --unread --exclude-type 'cynapse.*'`.
2. Act on each entry.
3. Mark read up to the last one you acted on: `cynapse --as bob read review-12 --to 5`.

If the process stops between steps 2 and 3, the next list shows the same entries again. Make
the work in step 2 safe to repeat, for example by appending with a fixed `--id`
([Entries](/cynapse/concepts/entries/#two-identities-id-and-seq)). This gives
at-least-once processing ([Guarantees](/cynapse/concepts/guarantees/#delivery)).

## Unread

An entry is **unread** for a participant when its `seq` is past their cursor and they
didn't write it. That includes `cynapse.*` metadata entries: a member joining, a tag added
later, a state change. Filter them out with `--exclude-type 'cynapse.*'` when you only want
messages.

- `cynapse unread` lists the channels you are a **member** of that have unread entries,
  with a count for each, plus channels where someone replied in a thread you
  [follow](#followed-threads).
- `cynapse entry list <channel> --unread` lists the unread entries in one channel. It works
  in any channel, member or not.
- `cynapse channel show <channel>`, run as you, includes your unread count in the stats.

```console
$ cynapse --as bob unread
review-12  4 unread
```

Two kinds of channel never show in `unread` on membership alone:

- A channel where you keep a cursor but aren't a member, such as one you observe. Only
  replies in threads you follow there count.
- **Your own address channel.** Its owner isn't a member, so direct messages to you don't
  appear in `unread`. Read them with `entry list <your address handle> --unread`.

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
sessions acting as the same participant share one cursor. That lets a durable role's
backlog wait while nobody is reading, and still be there for the next reader.

## Reads are not entries

Every other change to a channel is written as a `cynapse.*` entry. Moving a cursor isn't,
because logging every read would bloat the channel with entries that say nothing about
the work. So moving a cursor doesn't move the [change token](/cynapse/concepts/messaging/#knowing-that-something-arrived).

## Related

- CLI: [`read`, `unread`, `changes`](/cynapse/cli/read/)
- API: [`Store.markRead`, `Store.unread`](/cynapse/api/store/#read-state)
