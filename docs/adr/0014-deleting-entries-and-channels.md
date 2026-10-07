# ADR-0014: Deleting an entry or a channel

## Status

Accepted, 2026-10-06. Answers [#60](https://github.com/cyberuni/cynapse/issues/60). Built.

## Context

[ADR-0003](0003-entry-identity-and-order.md) makes entries immutable: an edit or a
retraction is a new entry that refers to the old one. That covers *changing what was
said*. It does not cover *removing what was said*, where the point is that the content is
gone: a secret pasted into a message, or a channel a person no longer wants.
[ADR-0006](0006-state-views-and-lifecycle.md) already allows removal as an optional
retention step: "If it is ever taken, the stream records the `seq` ranges it removed, so
readers can tell 'not received yet' from 'removed on purpose'."

Issue #60 came from cyberlegion, which asked for a delete and a purge to replace
`mail delete` and the mailbox reap on `unit close`, so it could retire its own message
store. Both of those exist because cyberlegion stores each message as a file. On cynapse,
`cynapse.handled` takes a message out of the inbox and `retireParticipant` stops an address
resolving, so cyberlegion was asked to drop the requirement
([cyberuni/cyberlegion#153](https://github.com/cyberuni/cyberlegion/issues/153#issuecomment-6013494747)).
Deleting stays, for its own reasons: redaction, and a person deleting a message or a
channel from the GUI.

## Decision

**cynapse deletes, as ADR-0006's retention step: the content goes, its place stays.**

- `deleteEntry(entryRef, author)`, and `cynapse entry delete <entry>`, erases one entry.
- `deleteChannel(ref, author)`, and `cynapse channel delete <channel>`, erases every entry in
  a channel and hides the channel.

### A deleted entry leaves a tombstone

The entry's row stays, with its `id`, channel, `seq`, author, type, `parent`, `root` and
arrival time. Its body, data, refs and tags are erased, and it records who deleted it and
when (`deleted: { at, by }` on the `Entry`). The delete is logged as a
`cynapse.entry.deleted` entry in the same channel and transaction, naming the target and
its `seq` but none of its content.

A tombstone, not a removed row, because each of these depends on the row staying:

- **`seq` is never reused.** The order owner assigns the channel's last `seq` + 1. Removing
  the last entry's row would hand its `seq` to the next append, and a reader whose cursor
  had passed it would never see the new entry.
- **Replies still resolve.** A reply names its `parent` and `root` by id; the tombstone
  answers both, so a thread keeps its shape with a hole where the deleted entry was.
- **Readers can tell removed from not-yet-received**, as ADR-0006 requires. The tombstone
  is the per-entry record of the removed `seq`.
- **Anchors still resolve.** A channel branched from a deleted entry keeps its parent.

Reads hide tombstones unless asked: `entries` skips them unless `includeDeleted` is set
(`--include-deleted`), and `search`, unread counts and `appendUnless` skip them.
`entry(ref)` returns the tombstone, so a reference never dangles. A tombstone cannot be
replied to, tagged or pinned, and deleting it again returns the entry that logged its
delete, so a caller may retry.

Entries in the `cynapse.*` namespace are not deletable. They are the channel's record of
its own metadata, including the deletes themselves; deleting them would delete the audit
of the delete.

### A deleted channel is a lifecycle state

`deleteChannel` tombstones every entry outside `cynapse.*` and moves the channel to the
lifecycle state `deleted`, logged as one `cynapse.channel.deleted` entry with the count.
ADR-0006 already says cleanup is a lifecycle state; this is the state for a channel whose
content is gone.

- **The channel row stays.** Its id, handles and subject keys still resolve, so
  references into it, and channels anchored in it, never dangle. Creating it again from
  its subject returns it, still deleted.
- **Listings hide it.** `listChannels` and `tree` skip `deleted` channels unless asked
  with `includeDeleted` or `state: 'deleted'`.
- **It can be restored.** `setLifecycle` to any other state brings it back, empty except
  for its `cynapse.*` history. Deleting it again erases whatever arrived since, or, with
  nothing new, returns the last delete.
- **`deleted` is reserved.** `setLifecycle` refuses it, so a channel is never marked
  deleted with its content still there.
- **Child channels are left alone.** They are their own subjects; deleting them is
  their own act.

### Who may delete: anyone

There is no permission check. cynapse can't tell whether the caller is a person or an
agent acting for one: `--as` is a claim, and so is a participant's `kind`. A rule keyed on
either would block the normal case, an agent deleting at a person's request, while anyone
willing to claim the right identity got past it. What cynapse can do is record the claim:
the `cynapse.entry.deleted` and `cynapse.channel.deleted` entries name who deleted, and
they can't themselves be deleted. Checking who may delete comes with the hub, which can
issue scoped grants rather than trust claims.

`cynapse.handled` keeps its owner-only rule (ADR-0013). That rule decides whose triage
set a tag changes, not whether a caller is trusted.

## Considered options

- **Never delete; cyberlegion drops its features** (issue #60, option 2). cyberlegion
  drops them, but deletion stays for redaction and the GUI, which need the content gone.
- **Remove the row.** Rejected: `seq` reuse, dangling `parent` and `root`, and no way to
  tell removed from not received.
- **Remove the channel row.** Rejected: anchors, aliases and subject keys would dangle, and
  re-creating the subject would make a new, unrelated channel with the same id.
- **Record removed `seq` ranges in a separate table**, as ADR-0006 sketched. Not needed:
  a per-entry tombstone records the same thing, and also keeps the reply tree resolving.
- **Owner-only, or humans only.** Rejected: neither identity can be verified, and both
  block an agent deleting on a person's behalf.
- **A participant purge for retired address channels.** Dropped with cyberlegion's
  requirement; `deleteChannel` covers it.

## Consequences

- Schema migration 5 adds `deleted_at` and `deleted_by` to `entries`.
- `Entry` gains `deleted`, `EntryQuery` and `ListChannelsQuery` gain `includeDeleted`, and
  `Store` gains `deleteEntry` and `deleteChannel`. A store that is not SQLite, such as the
  hub, must keep the same tombstone semantics.
- `stats.entries` counts entries that are not deleted; `stats.lastSeq` still counts every
  `seq` handed out.
- Once sync exists, a delete has to travel as its log entry so every replica erases the
  content. Nothing syncs yet.
- Open state records on a deleted channel stay open; resolving them is the caller's act.

## Related

- [ADR-0003](0003-entry-identity-and-order.md): entries are immutable; retractions.
- [ADR-0006](0006-state-views-and-lifecycle.md): removal as a retention step; cleanup as a
  lifecycle state.
- [ADR-0013](0013-messaging-between-participants.md): owner-only `cynapse.handled`; local trust.
- cyberuni/cyberlegion#153: retiring cyberlegion's mail store without deleting.
