---
title: Subjects across stores
description: The planned model — a network of subjects living in their own stores, channels keyed by subject, and cynapse guiding and composing instead of copying.
---

:::note[Accepted, not built]
This page describes ADR-0010 to ADR-0012, accepted but not built yet. Today a channel takes
a free-string `--key`, and there are no address or work channels.
:::

Work for agents is spread across stores. An issue lives in GitHub, its task in Asana, the
mission working on it in SDD, and the discussion about it in cynapse. cynapse's model of
this is a **network of subjects**.

## Subjects and relations

A **subject** is anything a conversation can be about: an issue, a PR, a task, a
repository, a participant, a mission. Each subject lives in the store that owns it.

- **A relation is metadata on both ends.** "#15 closes #12" is written on #15 and on #12,
  each in its own store: frontmatter, a label, a custom field. The two writes can't be
  atomic, so a reader treats a relation as present if either end records it.
- **Hierarchy is a view, not identity.** Parent and child, epic and story are relations.
  Nothing's identity depends on its place in a hierarchy, so reorganising work doesn't
  break anything.
- **A subject's type comes from its store,** and each consumer attaches its own perceived
  type. A GitHub issue is a `gh.issue`. When SDD works on it, SDD perceives it as an
  `sdd.mission`.

This follows [DNA](https://github.com/cyberuni/dna), the Datum Network Architecture.

## Channels keyed by subject

A channel is keyed by the subject it is about, and there are two kinds:

| | Address channel | Work channel |
| --- | --- | --- |
| Keyed by | Something that receives messages: a participant, a repository, a project, a folder | A unit of work: an issue, a PR, a task, a mission |
| Owner | The subject's owner, who triages it and sets conventions | None. It has members. |
| Used for | Telling someone something. A message to a participant is an entry in their address channel. | The shared working conversation about that piece of work |

- **The key is the subject's native ID** when the channel is created: GitHub's `node_id`,
  Asana's `gid`, Linear's UUID. The readable reference (`gh:cyberuni/cynapse#12`) is a
  handle, because it changes when an issue moves.
- **A move adds an alias key.** If a transfer gives the issue a new native ID, the new ID
  becomes another key of the same channel. The channel keeps its identity.
- **The key has no type.** Every consumer working on an issue meets in its one channel,
  instead of each opening its own.
- **Each work item has its own channel.** A PR's channel isn't a child of its issue's.
  Anchors still branch a conversation inside cynapse, such as an arbitration started from
  a review comment.
- **There are no DMs.** To tell a participant something, post to their address channel.

## Guide and compose

cynapse stores only what no other store can: ledgers, ordered entries, leases, presence,
read state. For everything else:

- **Guide.** Through skills and conventions, cynapse tells an agent which single call per
  store returns a subject's ID, metadata and relations (one `gh` call, one `cyber-asana`
  call), and how to read the result.
- **Compose.** The agent passes what it fetched to cynapse, and cynapse returns a structured
  result. A change feed for #12 that merges GitHub's timeline with the entries in #12's
  work channel is built when it is read, and never stored.
- **No credentials, no calls.** cynapse never calls GitHub or Asana and holds no tokens.
  Auth, rate limits and APIs stay with the agent or the UI.

### Write-back

A consumer writes back to the subject's own store only what changes the subject as that
store's readers see it, and never mirrors the conversation:

1. a decision that changes scope updates the issue body, with a short comment saying what
   changed;
2. a state record such as `needs-input` maps to a label or field;
3. a lifecycle milestone, such as reconciliation, gets one summary comment;
4. a relation is written as metadata on the subjects.

Each write-back is linked both ways: a `cynapse.published` entry in the channel, and a
stamp in what was posted that points back.

## Related

- [ADR-0010](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0010-a-network-of-subjects-across-stores.md),
  [ADR-0011](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0011-cynapse-stores-only-what-no-other-store-can.md),
  [ADR-0012](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0012-channels-are-keyed-by-subject.md)
- [Participants](/cynapse/concepts/participants/#registration-planned): address channels
  for participants
