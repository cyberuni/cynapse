# ADR-0012: Channels are keyed by subject: address channels and work channels

## Status

Proposed, 2026-10-03. Amends [ADR-0004](0004-stream-identity-handles-and-anchors.md).

## Context

Agents need two kinds of conversation. One is a place to tell a repository, project or
participant something, the way a public channel belongs to a team. The other is a shared
conversation about one unit of work: an SDD mission, a GitHub issue, a PR under review.

ADR-0004 derives a channel's ID from a natural key, such as a DM's set of participants.
In the prototype the key is a free string, and creating a channel with an existing key but
a different type fails with `id_conflict`. Readable references such as
`gh:cyberuni/cynapse#12` aren't stable: an issue transferred to another repository changes
its number and repository, and a Linear issue moved to another team changes its
identifier. Native IDs aren't fully stable either. A GitHub issue transfer issues a new
`node_id`, and the old one stops resolving (LC12). A GitLab move creates a new issue (LC13).
A store's native ID survives a rename, but not a move.

## Decision

- **A channel is keyed by its subject**
  ([ADR-0010](0010-a-network-of-subjects-across-stores.md)). There are two kinds:
  - **An address channel** is keyed by something that can receive messages: a
    participant, a repository, a project, a folder. It has an owner, the subject's owner,
    who triages it and sets its conventions.
  - **A work channel** is keyed by a unit of work: an issue, a PR, a task, a mission. It
    has members but no single owner.
- **The key is the subject's native ID when the channel is created,** not its readable
  reference: GitHub's `node_id`, Asana's `gid`, Linear's UUID. The readable reference
  (`gh:cyberuni/cynapse#12`) is a handle. A folder has no stable ID outside cynapse, so
  cynapse registers an address for it, because cynapse owns addressing.
- **A move adds an alias key; the channel keeps its identity.** When a subject moves and
  its store gives it a new native ID, the new ID becomes an alias key of the same channel,
  as an old handle becomes an alias. The store records the move itself (GitHub's
  `TransferredEvent`, GitLab's `movedTo`), so no relation is written for it. A consumer
  detects the move by resolving a handle the channel already has: the old readable
  reference still resolves to the moved subject (LC12), and its native ID no longer
  matches the channel's keys.
- **The key does not include a type.** Every consumer that works on a subject meets in its
  one channel and attaches a perceived type, instead of creating a channel of its own.
- **Each work item has its own channel.** A PR's channel is the PR's, not a child of its
  issue's. Relations between work items are relations (ADR-0010), not channel structure.
- **Anchors branch a conversation.** An arbitration started from a review comment is a
  child channel anchored there, as ADR-0004 says. Anchors form a tree and stay inside
  cynapse.
- **There is no DM.** Telling a participant something means posting to their address
  channel. A private two-party channel comes back only when a use case needs it.

## Considered options

- **Key by subject (chosen).**
- **Key by subject plus type.** Rejected. Two consumers working on one issue would get two
  channels and a split conversation.
- **Key by readable reference.** Rejected. It changes when the subject moves, and
  identity must never change.
- **Re-key the channel to the new native ID after a move.** Rejected. Channel IDs are
  written into every entry, so re-keying rewrites history.
- **A PR as a child channel of its issue.** Rejected. The relation is many-to-many, and a
  parent fixed into the ID is wrong for good once work is reorganized.
- **Ownership as what separates the two kinds.** Not chosen as the definition. Ownership
  follows from the key: an address has an owner because whatever it names has one.

## Consequences

- Splitting an issue leaves its channel where it is. The new issues get their own
  channels, and the relation is written on the subjects. A duplicate gets a
  `superseded` state pointing to the issue that replaced it, so readers follow it.
- A move goes undetected until someone resolves one of the channel's old handles. Until
  then, a consumer that starts from the new reference opens a new channel. Merging two
  channels for one subject is a `superseded` relation between them, not a rewrite.
- Resolving a readable reference to a native ID needs the store's API. The consumer does
  that ([ADR-0011](0011-cynapse-stores-only-what-no-other-store-can.md)) and passes the ID
  to cynapse.
- The key scheme, the native ID without a type, is expensive to undo, because channel IDs
  are written into every entry. It should be settled before any consumer writes real
  channels. Whether DMs come back can be revisited cheaply.
- This closes the open question of whether a DM can gain members.

## Related

- [ADR-0004](0004-stream-identity-handles-and-anchors.md), [ADR-0010](0010-a-network-of-subjects-across-stores.md), [ADR-0011](0011-cynapse-stores-only-what-no-other-store-can.md).
- Evidence: LC12, LC13.
- Research round 11 in `changes.md`.
