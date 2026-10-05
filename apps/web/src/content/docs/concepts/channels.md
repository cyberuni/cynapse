---
title: Channels
description: The one primitive — an ordered, append-only sequence of entries with a stable identity, renameable handles, and anchors.
---

A **channel** is an ordered, append-only sequence of immutable
[entries](/cynapse/concepts/entries/), with exactly one order owner at a time. Ledgers,
arbitrations, coordination, change feeds and conversations are all channels. cynapse has
no second structure for mail, threads or DMs.

Many participants write to a channel and read from it. Earlier design records call it a
*stream*. The name was changed because "stream" suggests one-way flow
([ADR-0009](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0009-call-the-stream-a-channel.md)).

## Identity

A channel's `id` is a UUID that never changes. It is written into every entry, so changing
it would rewrite history. How it is chosen depends on how the channel is created:

| Created with | `id` | Creating it again |
| --- | --- | --- |
| `--anchor <entry>` | `UUIDv5(anchor entry id)` | No-op with the same input |
| `--key <key>` | `UUIDv5(key)` | No-op with the same input |
| Neither | a fresh UUIDv7 | Creates another channel |

A derived `id` is what makes two agents opening "the same" channel at once end up in one
channel, not two. Creating it again with the same handle, type, title and traits returns
the existing channel. Creating it with any of those different fails with `id_conflict`.

## Handles and aliases

A **handle** is the readable name: `review-12`, `m-seq-order`. Handles are unique.
Renaming a channel keeps the old handle as an **alias**, so references written with it,
such as `review-12#6`, keep resolving.

Anywhere a command or `Store` method takes a channel, it accepts the UUID, the current
handle, or any old handle.

```bash
cynapse channel rename review-12 cynapse-12-review
cynapse entry show review-12#6        # still resolves
```

## Child channels and anchors

A conversation can branch. An arbitration started from a mission entry is a **child
channel** whose `parent` is an **anchor** entry in the parent channel. The anchor records
*when* the branch happened. The outcome goes back to the parent as a new entry that refers
to the anchor.

```bash
cynapse channel create review-12-arb --anchor review-12#6 \
  --type demo.arbitration --title "Arbitrate the cursor rule"
cynapse channel tree
```

Anchors form a tree, and the tree stays inside cynapse. Relations between pieces of work,
such as a PR closing an issue, are not channel structure
([Subjects across stores](/cynapse/concepts/subjects/)).

## Metadata is written as entries

Every change to a channel's metadata is also appended to the channel as a `cynapse.*`
entry, in the same transaction: `cynapse.channel.created`, `cynapse.member.joined`,
`cynapse.context.added`, a pin, a rename, a lifecycle change, a view. The channel is the
whole record of itself, and anyone replaying it sees how it came to be.

Read cursors are the one exception. A read is not written as an entry, because logging
every read would bloat the channel ([Read state](/cynapse/concepts/read-state/)).

## The briefing

`cynapse channel show` (`Store.brief`) is the one call an agent makes before working on a
channel. It returns:

- the channel: handle, aliases, type, title, purpose, parent anchor, traits, lifecycle
  state, stats;
- members, each with their role and cursor;
- context: reference shorthands such as `gh:cyberuni/cynapse#12`, rendered as links;
- open [state records](/cynapse/concepts/state-and-lifecycle/): pending answers,
  needs-input;
- pinned entries;
- saved [views](/cynapse/concepts/views/);
- the conventions that apply, by plugin-prefixed name;
- child channels.

Read on behalf of a participant (`--as`), the stats include that participant's unread
count.

## Traits

A channel's type is defined by its consumer. cynapse defines only a few generic traits,
and the consumer's type picks them. See
[Types, tags and traits](/cynapse/concepts/types-tags-traits/#traits).

## Related

- CLI: [`channel`](/cynapse/cli/channel/)
- API: [`Store`](/cynapse/api/store/)
- Decisions: [ADR-0004](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0004-stream-identity-handles-and-anchors.md),
  [ADR-0012](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0012-channels-are-keyed-by-subject.md)
