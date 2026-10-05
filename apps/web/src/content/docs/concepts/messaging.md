---
title: Messaging
description: Messages between agents and people as entries in the channel of what they are about — work traffic, direct traffic, replies, waiting, handled versus seen, observers and the change token.
---

:::note[Partly built]
This page describes [ADR-0013](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0013-messaging-between-participants.md),
which is accepted. Threads, cursors, tags and state records work today, and the
[quick start](/cynapse/getting-started/quick-start/) uses them for a conversation. Followed
threads, `excludeTags`, `excludeAuthors` and `entry wait` are built. Address and work
channels, the owner-only rule for `cynapse.handled`, and the change token are not.
:::

cynapse has no mailbox and no DM. **A message is an entry in the channel of what it is
about.** Who wrote it, who has read it, and what is still waiting are all things cynapse
already records for any entry.

Who registers participants, who wakes them and which session acts as a role belong to the
runtime. See [cynapse and the runtime](/cynapse/design/runtime/).

## Two kinds of traffic

| | Work traffic | Direct traffic |
| --- | --- | --- |
| What | A brief, a report, a decision, "trunk moved under you" | A question to a role, mail for a durable owner |
| About | One work item | No single work item |
| Goes on | The item's work channel (`gh:cyberuni/cynapse#30`) | The addressee's address channel |
| Who sees the reply | Both parties, as members | The asker, through a followed thread |

Most traffic between agents is about a work item, so most of it belongs on work channels.
Whoever joins the work later reads the whole exchange in one place.

## Addressing by name

A runtime registers each participant with a key such as `cyberlegion:role/reviewer`
([Participants](/cynapse/concepts/participants/#registration-planned)).
`resolveAddress('reviewer')` matches the name exactly against live participants and their
address channels' handles:

- exactly one match returns it;
- more than one fails with `ambiguous_address` and lists every candidate. cynapse never
  picks one;
- none fails with `unknown_address`. Sending to a typo no longer creates a participant.

A durable role is a participant. Its cursor belongs to the participant, not to the session
reading as it, so the role's backlog waits until some session reads it.

## Conversations

A reply is an entry whose `parent` is the message it answers, in the same channel. The
whole conversation is `entry list <channel> --root <entry>`, which works today. **A
conversation lives in the channel where it began.** It never alternates between two
channels, because a split conversation can't be read as one.

On a work channel, both parties are members, so each sees the other's replies in their own
`unread`. A direct message is the one gap: the asker isn't a member of the addressee's
address channel. So a participant **follows every thread they wrote in**, and `unread`
counts replies in followed threads too. Nothing is stored for this; it is derived from the
entries. See [Followed threads](/cynapse/concepts/read-state/#followed-threads).

## Waiting for an answer

`cynapse entry wait <entry> --timeout <seconds>` polls the thread in the waiter's own
process and prints the first reply from someone else, or exits with a distinct timeout
code (`3`). There is no daemon. See [`entry wait`](/cynapse/cli/entry/#cynapse-entry-wait).

When "still waiting" must outlive the waiter, the asker opens a
[state record](/cynapse/concepts/state-and-lifecycle/) of kind `cynapse.awaiting-reply`.
Whoever answers or gives up resolves it. cynapse doesn't resolve it on a reply, because a
reply isn't always an answer.

## Seen versus handled

**Seen** is the [cursor](/cynapse/concepts/read-state/). **Handled** is an act worth
recording, so it is the tag `cynapse.handled`, added as a `cynapse.label` entry. The
unhandled set is a query with `excludeTags`. Removing the tag reopens the message.

Handled is defined on address channels, where one owner triages the inbox, and only that
owner may add or remove it. The store enforces this: anyone else fails with `not_owner`, and
the tag on a work channel fails with `not_address`. A work channel has members and no owner; what still needs action there is
already a state record, such as needs-input.

## Observers

An observer reads a participant's address channel with its own cursor, so the owner's
unread count doesn't move. It joins with role `observer`, so the briefing shows who is
watching. Following everything a participant sends, across all their channels, is the
change token followed by `entries(channel, { afterSeq, authors })` on each channel that
moved.

`--as` isn't authenticated. "Observers can't disturb" holds for well-behaved callers until
the hub brings access control.

## Knowing that something arrived

`changes(since)` returns an opaque token and the channels whose last `seq` moved since
`since`. A runtime polls it cheaply and calls `unread` only for channels that changed. On
SQLite, the token is a counter bumped in the same transaction as each append.

The token is not an order of entries and can't be compared across stores. There is no push
and no subscription. **cynapse never wakes anyone.** A channel's `wake` trait is advice to
the runtime, which decides.

## Related

- [cynapse and the runtime](/cynapse/design/runtime/): who owns waking, liveness and claims.
- [Subjects across stores](/cynapse/concepts/subjects/): address and work channels.
- Issue [#30](https://github.com/cyberuni/cynapse/issues/30): the ten needs this answers.
