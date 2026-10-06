# ADR-0014: Deleting an entry, and purging a retired participant's address channel

## Status

Accepted, 2026-10-06. Answers [#60](https://github.com/cyberuni/cynapse/issues/60). Built.

## Context

A runtime that moves its messaging onto cynapse wants to retire its own message store.
cyberlegion is the first: its mail lives in its own store today, and two of its features
have no cynapse equivalent (cyberuni/cyberlegion#153):

- `mail delete` removes one message from a session's inbox.
- `unit close` removes a closed session's whole mailbox.

[ADR-0003](0003-entry-identity-and-order.md) makes entries immutable: an edit or a
retraction is a new entry that refers to the old one. That covers *changing what was
said*. It does not cover *removing what was said*, where the point is that the content is
gone. [ADR-0006](0006-state-views-and-lifecycle.md) already allows that as an optional
retention step: "Removing raw entries physically is an optional retention step. If it is
ever taken, the stream records the `seq` ranges it removed, so readers can tell 'not
received yet' from 'removed on purpose'." [ADR-0013](0013-messaging-between-participants.md)
says a retired participant is never deleted, because entries name it as their author, and
that its address channel stays readable after retirement.

Issue #60 asked for either a delete operation or an explicit decision that cynapse never
deletes, and left three questions open: who may delete, whether a deleted entry leaves a
tombstone, and whether retiring a participant purges its address channel.

## Decision

**cynapse deletes, as ADR-0006's retention step: the content goes, the entry's place in
the channel stays.** Two operations, on address channels only:

- `deleteEntry(entryRef, author)`, and `cynapse entry delete <entry>`, removes one entry.
- `purgeParticipant(id, author)`, and `cynapse participant purge <participant>`, removes
  every entry in a retired participant's address channel.

### A deleted entry leaves a tombstone

The entry's row stays, with its `id`, channel, `seq`, author, type, `parent`, `root` and
arrival time. Its body, data, refs and tags are erased, and it records who deleted it and
when (`deleted: { at, by }` on the `Entry`). The delete itself is logged as a
`cynapse.entry.deleted` entry in the same channel and the same transaction, naming the
target and its `seq` but none of its content.

A tombstone, not a removed row, because each of these depends on the row staying:

- **`seq` is never reused.** The order owner assigns the channel's last `seq` + 1. Removing
  the last entry's row would hand its `seq` to the next append, and a reader whose cursor
  already passed it would never see the new entry.
- **Replies still resolve.** A reply names its `parent` and `root` by id; the tombstone
  answers both, so a thread keeps its shape with a hole where the deleted entry was.
- **Readers can tell removed from not-yet-received**, which ADR-0006 requires. The tombstone
  is the record of the removed `seq`, one per entry rather than a range table, since an
  inbox deletes one message at a time.
- **An anchor still resolves.** A channel branched from a deleted entry keeps its parent.

Reads hide tombstones unless asked: `entries` skips them unless `includeDeleted` is set
(`--include-deleted`), `search` and unread counts skip them, and `appendUnless` does not
match them. `entry(ref)` returns the tombstone, so a reference never dangles. A tombstone
cannot be replied to, tagged or pinned, and deleting it again returns the entry that
logged its delete, so a runtime may retry.

Entries in the `cynapse.*` namespace are not deletable. They are the channel's record of
its own metadata (registrations, labels, renames, the deletes themselves), and deleting
them would delete the audit of the delete.

### Who may delete: the address channel's owner

Deleting an entry follows `cynapse.handled`: it is defined on address channels, and only
the channel's owner may do it (`not_owner`). A work channel fails with `not_address`.

- **The owner, because the inbox is theirs.** `mail delete` is the recipient clearing
  their own inbox. A sender who wants to take a message back writes a retraction, as
  ADR-0003 already says.
- **Not on work channels, for now.** A work channel has members and no owner (ADR-0012), so
  "whose call is it" has no single answer. Deleting there comes back when a use case
  brings a rule for it, such as an author deleting their own entry.
- **Local trust, as with `cynapse.handled`.** `--as` is not authenticated; the rule holds
  for well-behaved callers until the hub brings access control.

### Retiring and purging are separate steps

`retireParticipant` keeps its meaning from ADR-0013: the participant stops resolving and
its address channel stays readable. Purging is a second, explicit step.

- **Retiring is reversible and purging is not.** Registering a retired key revives the
  participant with its address channel. Folding the purge into retire would make a revive
  bring back an empty inbox, and a runtime that retires a session by mistake, or only
  reconciles a crash, would lose its mail.
- **The runtime decides when.** A runtime may keep a closed session's mail readable for a
  while before it purges. cyberlegion's `unit close` maps to `participant retire` then
  `participant purge`.
- **Purge needs the participant retired.** Purging a live participant's inbox would race
  with arriving mail; retire it first.
- **Who may purge: the participant or the unit that registered it** (`not_owner` for
  anyone else). The registering unit is the one that retires it (ADR-0013), so it is the
  one that cleans up after it.

Purge tombstones every entry in the address channel outside `cynapse.*`, as `deleteEntry`
would one at a time, and logs one `cynapse.participant.purged` entry with the count. The
channel and its `cynapse.*` history stay, so the participant's registrations and
retirements stay inspectable, and a revived participant starts with an empty inbox.
Purge does not touch what the participant wrote in other channels: those entries belong
to their recipients' inboxes and threads.

## Considered options

- **Never delete; cyberlegion drops both features** (issue #60, option 2). Rejected. It
  keeps every message forever in a store that is local and unsynced, which is the
  opposite of what an inbox user expects, and ADR-0006 already anticipated removal.
- **Remove the row.** Rejected for the reasons the tombstone exists: `seq` reuse, dangling
  `parent` and `root`, and no way to tell removed from not received.
- **A retraction entry only, with the content kept.** Rejected as the answer to delete. It
  is what ADR-0003 already offers for changing what was said, and it leaves the content
  in place.
- **Record removed `seq` ranges in a separate table**, as ADR-0006 sketched. Not needed:
  a per-entry tombstone records the same thing, and also keeps the reply tree resolving.
- **Purge on retire.** Rejected above: retire is reversible, and purge is not.
- **Let any member, or the author, delete.** Deferred. Owner-only matches the inbox use
  case and `cynapse.handled`, and is easier to widen than to narrow.

## Consequences

- Schema migration 5 adds `deleted_at` and `deleted_by` to `entries`.
- `Entry` gains `deleted`, `EntryQuery` gains `includeDeleted`, and `Store` gains
  `deleteEntry` and `purgeParticipant`. A store that is not SQLite, such as the hub, must
  keep the same tombstone semantics.
- `stats.entries` counts entries that are not deleted; `stats.lastSeq` still counts every
  `seq` handed out.
- Once sync exists, a delete has to travel as its `cynapse.entry.deleted` entry so every
  replica erases the content. Nothing syncs yet.
- cyberlegion can map `mail delete` to `cynapse entry delete` and `unit close` to
  `participant retire` followed by `participant purge`, and retire its own store.

## Related

- [ADR-0003](0003-entry-identity-and-order.md): entries are immutable; retractions.
- [ADR-0006](0006-state-views-and-lifecycle.md): removal as a retention step.
- [ADR-0013](0013-messaging-between-participants.md): owner-only `cynapse.handled`, and
  the participant lifecycle.
- cyberuni/cyberlegion#153: retiring cyberlegion's mail store.
