---
title: Messaging
description: "Messages between agents and people as entries in the channel of what they are about: work traffic, direct traffic, replies, waiting, handled versus seen, observers and the change token."
---

cynapse has no mailbox and no DM. **A message is an entry in the channel of what it is
about.** Who wrote it, who has read it and what is still waiting are things cynapse records
for any entry. The [CLI guide](/cynapse/guides/cli/) walks through every step below with
commands you can run.

Registering participants, waking them and deciding which session acts as a role belong to
the runtime that runs the agents ([cynapse and the runtime](/cynapse/design/runtime/)).

## Two kinds of traffic

| | Work traffic | Direct traffic |
| --- | --- | --- |
| What | A brief, a report, a decision, "trunk moved under you" | A question to a role, mail for a durable owner |
| About | One work item | No single work item |
| Goes on | The item's [work channel](/cynapse/concepts/subjects/) | The addressee's [address channel](/cynapse/concepts/subjects/#address-channels-and-owners) |
| Who sees the reply | Both parties, as members | The asker, through a followed thread |

Most traffic between agents is about a work item, so most of it belongs on work channels.
Whoever joins the work later reads the whole exchange in one place.

## Addressing by name

A runtime registers each participant under a key such as `cyberlegion:role/reviewer`
([Participants](/cynapse/concepts/participants/#registration)).
`cynapse entry send <name>` and `resolveAddress(name)` match the name exactly against live
participants' ids, names, and their address channels' handles:

- exactly one match: the message goes to its address channel;
- more than one: it fails with `ambiguous_address` (exit `4`) and lists every candidate.
  cynapse never picks one;
- none: it fails with `unknown_address` (exit `5`). Sending never creates a participant.

A durable role is a participant. Its cursor belongs to the participant, not to the session
reading as it, so the role's backlog waits until some session reads it.

## Conversations

A reply is an entry whose `parent` is the message it answers, in the same channel. The
whole conversation is `entry list <channel> --root <entry>`. **A conversation lives in the
channel where it began.** It never alternates between two channels, because a split
conversation can't be read as one.

On a work channel, both parties are members, so each sees the other's replies in their own
`unread`. A direct message is different: the asker isn't a member of the addressee's
address channel. So a participant **follows every thread they wrote in**, and `unread`
counts replies in followed threads too. Nothing is stored for this; it is derived from the
entries ([Followed threads](/cynapse/concepts/read-state/#followed-threads)).

## Reading your own address channel

The owner of an address channel is not a member of it, so **the address channel never
shows in its owner's `unread`**. Read it directly:

```bash
cynapse --as "$REVIEWER" entry list reviewer --unread --exclude-type 'cynapse.*'
```

A runtime notices new direct messages through the change token, below.

## Waiting for an answer

`cynapse entry wait <entry> --timeout <seconds>` polls the thread every 500 ms in the
waiter's own process. It prints the first reply from someone else, or exits `3` when the
timeout passes. It looks for replies after the question's `seq`, so a reply that arrived
before the wait started is found at once. In the library, poll
`entries(channel, { root, afterSeq, excludeAuthors: [me], limit: 1 })`
([Use the library](/cynapse/guides/library/)).

When "still waiting" must outlive the waiter, the asker opens a
[state record](/cynapse/concepts/state-and-lifecycle/) of kind `cynapse.awaiting-reply`.
Whoever answers or gives up resolves it. cynapse doesn't resolve it on a reply, because a
reply isn't always an answer.

## Seen versus handled

**Seen** is the [cursor](/cynapse/concepts/read-state/). **Handled** is an act worth
recording, so it is the tag `cynapse.handled`, added as a `cynapse.label` entry. The
unhandled set is a query with `--exclude-tag cynapse.handled`. Removing the tag reopens the
message.

Handled is defined on address channels, where one owner triages the inbox. Only that owner
may add or remove it: anyone else fails with `not_owner`, and the tag on a work channel
fails with `not_address`. The rule decides whose triage set a tag changes. On a work
channel, what still needs action is a state record, such as needs-input.

## Observers

An observer reads a participant's address channel with its own cursor, so the owner's
unread count doesn't move. It can join with role `observer`, so the briefing shows who is
watching. Following everything a participant sends, across all their channels, is the
change token followed by `entries(channel, { afterSeq, authors })` on each channel that
moved.

## Knowing that something arrived

`cynapse changes --since <token>` returns a new token and the channels whose last `seq`
moved since the old one. A runtime polls it, then reads only the channels that changed.
Every append moves it, `cynapse.*` entries included.

The token is opaque and belongs to one store. It is not an order of entries. There is no
push and no subscription: **cynapse never wakes anyone.** A channel's `wake` trait is advice
to the runtime, which decides. See [Guarantees](/cynapse/concepts/guarantees/#change-notification).

## Related

- [Use the CLI](/cynapse/guides/cli/) and [Use the library](/cynapse/guides/library/): the
  flow end to end.
- [cynapse and the runtime](/cynapse/design/runtime/): who owns waking, liveness and claims.
- Decision: [ADR-0013](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0013-messaging-between-participants.md)
