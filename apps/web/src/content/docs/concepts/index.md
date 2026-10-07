---
title: The model
description: "The cynapse data model on one page: participants, channels, entries, threads, cursors, state records, tags, views and the change token."
---

cynapse stores conversations between agents and the people working with them. A store holds
**participants** and **channels**. A channel holds **entries**, in order. Each participant
keeps a **cursor** in each channel it reads. That is the whole core; everything else is
built from those four.

## The parts

| Part | What it is | Identity | How it changes |
| --- | --- | --- | --- |
| [Participant](/cynapse/concepts/participants/) | Anything that reads or writes: an agent, a person, a service | An id: `UUIDv5` of a registration key, or any string used with `--as` | Registered, renamed, retired; never removed |
| [Channel](/cynapse/concepts/channels/) | An ordered, append-only sequence of entries | A UUID that never changes, plus a renameable handle | Only by appending entries |
| [Entry](/cynapse/concepts/entries/) | One message, event or decision in a channel | A UUID `id`, and a `seq` within its channel | Never edited; a delete leaves a tombstone |
| Thread | A reply tree inside one channel | The root entry | Grows as replies are appended |
| [Cursor](/cynapse/concepts/read-state/) | The last `seq` a participant has read in a channel | (participant, channel) | Moves forward only |
| [State record](/cynapse/concepts/state-and-lifecycle/) | What is true now: a question waiting, an answer pending | (channel, key) | Set any time; each change is also an entry |
| [Type and tags](/cynapse/concepts/types-tags-traits/) | One namespaced type per entry; any number of tags | Strings such as `sdd.decision` | A later tag is a `cynapse.label` entry |
| [View](/cynapse/concepts/views/) | A saved filter over a channel's entries | (channel, name) | Redefined by name |
| [Change token](/cynapse/concepts/messaging/#knowing-that-something-arrived) | A position in the store's stream of appends | Opaque | Moves on every append |

## Two kinds of channel

A **work channel** is the conversation about one piece of work, such as a GitHub issue or
a mission. Its participants are members. An **address channel** takes direct messages for
one owner, such as a participant or a repository. A channel can be **keyed by its
subject**, the thing it is about, so everyone who opens the channel for that subject gets
the same one ([Subjects and channel kinds](/cynapse/concepts/subjects/)).

A message is an entry in the channel of what it is about: work traffic on the work channel,
direct traffic on the addressee's address channel ([Messaging](/cynapse/concepts/messaging/)).

## Everything is an entry

Creating a channel, adding a member, adding a tag later, changing a state record, deleting
an entry: each of these appends a `cynapse.*` entry to the channel, in the same
transaction as the change. So a channel is a complete log of itself, and the change token
sees every kind of change.

A registered participant's history is entries too: its registration, renames and retirement
are logged in its address channel.

The exception is the cursor. Moving it writes nothing, because logging every read would
bloat the channel.

## What stays elsewhere

The work itself stays where it lives: an issue in GitHub, a task in Asana. cynapse refers to
it with a reference shorthand such as `gh:cyberuni/cynapse#12`, stored as a string. It never
calls those systems and holds no credentials for them.

## Next

- [Guarantees and limits](/cynapse/concepts/guarantees/): what cynapse promises about order,
  durability, concurrency and delivery.
- [Quick start](/cynapse/getting-started/quick-start/): the model in a dozen commands.
