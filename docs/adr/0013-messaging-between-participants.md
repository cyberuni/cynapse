# ADR-0013: Messaging between participants on work and address channels

## Status

Accepted, 2026-10-04. Answers [#30](https://github.com/cyberuni/cynapse/issues/30).

Built: the schema version and forward migrations; ADR-0012's key scheme and address
channels; `excludeTags` and `excludeAuthors` in `ViewFilter`, followed threads in `unread`,
and `cynapse entry wait` with exit code `3` on timeout; the change token and
`cynapse changes`. Not built yet: the participant registry with `resolveAddress` and
`cynapse participant`, and owner-only `cynapse.handled`.

Built: the participant registry (needs 1 and 8). A participant's address channel is keyed by the
subject `{ store: 'cynapse', nativeId: <participant id> }`; its handle is made from the name, with
the first eight characters of the id appended when another channel holds that handle, since names
are not unique and handles are. `resolveAddress` also matches a live participant's exact id, so
every candidate an ambiguity lists can still be addressed. `ambiguous_address` exits `4` and
`unknown_address` exits `5`. A unit registers itself by omitting `registeredBy`, and must then be a
`service`. Registering a retired key revives the participant with its stored name.

## Context

A runtime that launches and manages agent sessions, cyberlegion first, keeps its own
messaging between those sessions and the people directing them. The settled decisions in
AGENTS.md say messaging belongs in cynapse, that cynapse owns participant addressing,
identity and presence, and that units register their participants with cynapse, never the
reverse. Issue #30 lists ten needs from that runtime and asks which fit cynapse's model,
which need new concepts, and which belong elsewhere.

What exists today, in `packages/cynapse/src/store/`:

- **Participants** are a bare row: `id`, `kind` (`agent | human | service`) and `name`
  (`types.ts`). `addParticipant` upserts by `id`. Any unknown `--as` value is created on
  first use as an `agent` whose name is its id (`#ensureParticipant` in `sqlite.ts`). Names
  are not unique, nothing resolves a name, there is no liveness and no retirement, and no
  participant change is written as an entry. There is no `participant` CLI command.
- **Channels** take an optional natural `key`, and the ID becomes `UUIDv5(key)`, so two
  callers with the same key meet in one channel. Handles are unique, and old handles
  resolve as aliases. Address and work channels
  ([ADR-0012](0012-channels-are-keyed-by-subject.md)) are accepted but not built: there is
  no owner, and no key scheme beyond the free string.
- **Entries** carry `parent` and `root`, and `entries(ref, { root })` returns a whole
  thread. A parent must be in the same channel.
- **Read cursors** are a row per (channel, participant). `markRead` works for any
  participant, member or not, and only moves forward. `entries(ref, { unreadFor })` and
  `unread(participant)` read them, and `unread` counts only channels the participant is a
  member of.
- **Tags** are current sets folded from `cynapse.label` entries. `ViewFilter` matches
  entries carrying *any* of a set of tags. It has no way to exclude a tag.
- **State records** are keyed per channel, with `kind`, `status` (`open | resolved`) and
  `subject`. Every transition is an entry. Leases are designed
  ([ADR-0006](0006-state-views-and-lifecycle.md)) but not built.
- **`ChannelTraits.wake`** exists, defaulting to `false`. Nothing reads it.
- **Change detection** is only `unread(participant)`, which joins members, cursors and
  entries on each call. There is no store-wide change position.
- **The package** exports `openStore`, `SqliteStore` and the `Store` types from `index.ts`,
  and the CLI covers channels, entries, read state, tags and state records. npm has only
  `0.0.0`. The schema has no version and no migrations
  ([ADR-0009](0009-call-the-stream-a-channel.md)).

## Decision

cynapse owns this messaging. It is communication with no other home
([ADR-0002](0002-own-only-communication-with-no-other-home.md),
[ADR-0011](0011-cynapse-stores-only-what-no-other-store-can.md)): who said what to whom,
who has read it, what is still waiting. None of it lives in GitHub or Asana. Seven of the
ten needs fit the model with small additions to existing parts. Three need new concepts:
a participant registry with lifecycle (needs 1 and 8), threads a participant follows
outside their own channels (need 3), and a store-wide change token (need 10). None belongs
elsewhere, though parts of four stay with the runtime: which session acts as a role
(need 2), observing whether a session is alive (need 8), resolving a repository's native ID
(need 9), and all of the waking in need 10. *What stays with the runtime* lists them.

The core rule: **a message is an entry in the channel of what it is about.** Traffic about
a work item goes on that item's work channel. Traffic addressed to a participant goes on
that participant's address channel. There is no mailbox, and no DM, as ADR-0012 says.

### Where traffic goes

Most of what a runtime sends between sessions is about a work item: a brief, the reports
on it, the decisions made on it, a notice that trunk moved under it. None of that is
person-to-person. It goes on the **work channel** keyed by that item (ADR-0012), such as
the channel of `gh:cyberuni/cynapse#30`. The sender and the recipient are both members, so
a reply reaches both through their own `unread`, and whoever joins the work later reads the
whole exchange in one place.

The **address channel** carries what is genuinely direct: a question to a role, mail for a
durable owner, anything that is not about one work item. The needs below describe the
address channel where the two differ, and followed threads (need 3) exist only for this
remaining case.

This is **expensive to unwind.** A conversation stays in the channel where it began
(ADR-0003), so traffic a runtime has sent to the wrong kind of channel stays there. It has
to be settled before a runtime writes real mail.

### The ten needs

**1. Addressing by name. New concept: a participant registry that resolves names.**
Channel handles are unique, so they can't be ambiguous, but a participant's `name` is not
unique, and the runtime needs "send to `reviewer`" to work without an id. Add
`resolveAddress(name)`. It matches the name against *live* participants' names and their
address channels' handles and aliases. Exactly one match returns it. More than one fails
with `ambiguous_address`, which lists every candidate (id, kind, name, registering unit),
and never picks one. None fails with `unknown_address`. The match is exact, not fuzzy: a
fuzzy match that happens to have one candidate today silently routes elsewhere tomorrow.
The existing model can't carry this, because nothing marks a participant live or retired
(need 8), and `#ensureParticipant` would turn any typo into a new participant. On send,
the resolver replaces that implicit creation. Implicit creation stays only for `--as`
during the prototype.

**2. Addresses that outlive a reader. Fits.** A durable role is a participant, and its
address channel is keyed by its participant ID (ADR-0012). Entries land there whether or
not anyone is reading. A session that reads as the role acts as the role
(`--as`/`$CYNAPSE_PARTICIPANT`), so it reads the role's cursor, `unread` shows the role's
backlog, and the backlog is there when a reader appears. A session that should be
addressable in its own right is a participant of its own, registered and retired with the
session (need 8). **The cursor belongs to the participant, not to the session.** That
choice is what lets a role's mail survive its readers.

**Which session acts as the role belongs to the runtime.** "Which session currently acts
as `reviewer`, and which pane the doorbell rings for it" is a claim, and the last claim
wins. A claim means something only to whatever runs the panes, so it is runtime state.
cynapse holds the role's address channel, its mail and its cursor. The runtime may write
the current claim as a state record on that channel so other readers can see it, but
cynapse does not define what a claim means, enforce one, or settle two.

**3. Conversations. Fits, plus one new concept: followed threads.** A reply is an entry
whose `parent` is the message it answers, in the same channel. The whole conversation is
`entries(channel, { root })`, which any participant who can read the channel can call
from any session. That works today. The conversation lives in the channel where it began.
On a work channel both parties are members, so the reply reaches the asker with nothing
added. A direct message begins in the addressee's address channel. It does not alternate
between the two parties' address channels, because a conversation split across two channels can't be read as one, and an
entry's parent must be in its own channel (ADR-0003).

The gap is the asker of a direct message. They are not a member of the addressee's
address channel, so the reply never
shows in their `unread`. Making them a member would show them all the addressee's traffic.
Add **followed threads**: a participant follows every thread they wrote an entry in. The
fact is derived from the entries, and no table is added. `unread(participant)` also counts
entries in followed threads, outside channels the participant is a member of, that come
after the later of their cursor on that channel and their own last entry in the thread.
The non-member cursor this needs already works. Followed threads are derived and cheap
to revisit. If most traffic goes on work channels, as it should, they carry little.

**4. Waiting for an answer. Fits. The only new part is the CLI verb.** Waiting is a
poll of the thread: `entries(channel, { root, afterSeq, excludeAuthors: [waiter] })`
until something arrives or the timeout passes. `excludeAuthors` is a small addition to
`ViewFilter`. Add `cynapse entry wait <entry> --timeout <seconds>`, which prints the first
reply, or exits with a distinct timeout code. It runs in the waiter's own process, with
no daemon ([ADR-0007](0007-stock-sqlite-outside-the-repository.md)). When "still waiting"
must outlive the waiter, so other readers or a later session can see it, the asker opens a
state record, the "pending answer" ADR-0006 already names: `kind: cynapse.awaiting-reply`,
`key` the question's entry ID, `subject` the addressee. Whoever answers or gives up
resolves it explicitly. cynapse doesn't resolve it when it sees a reply, because a reply
is not always an answer (ADR-0005 keeps decisions explicit).

**5. "Handled", separate from "seen". Fits as a reserved tag, plus one filter.** Seen is
the cursor. Handled is a fact about the entry, made by an act worth recording, so it is
the tag `cynapse.handled`, added with `addTags`. That writes a `cynapse.label` entry, so
who handled what, and when, stays in the channel. Removing the tag reopens it. The
unhandled set is a query over the address channel with a new `excludeTags` filter (today
`ViewFilter.tags` can only include). A state record per message would also work, but it
needs a write on every arrival to open it, and a tag needs nothing until someone acts.

Handled is defined on **address channels**, where one owner handles the inbox. A work
channel has members and no owner (ADR-0012), so "handled by whom" has no single answer
there. What still needs action on a work channel is already a state record: needs-input,
pending answer. Per-reader handled on a shared channel is not proposed. It comes back only
when a use case needs it.

**6. Observers don't disturb recipients. Fits for direct traffic; the rest needs
need 10.** An observer reads the participant's address channel with its own cursor, and
cursors are per reader, so the owner's unread count doesn't move. `afterSeq` replays from
any past point. The observer joins with role `observer`, so the briefing shows who is
watching and the channel appears in the observer's own `unread`. Membership changes
nothing for the owner. The observer must not add `cynapse.handled`. The store
enforces this: only the address channel's owner may add or remove that tag. A
participant's work traffic, and everything they send, is spread across every channel they
are a member of or write to, and following it means finding which channels changed. That is the change token from need 10,
followed by `entries(channel, { afterSeq, authors: [participant] })` on each changed
channel. The observer's position is its set of per-channel cursors, not a single global
order. ADR-0003 rejected a global order.

Identity here is local trust. `--as` is not authenticated, so "the observer can't disturb"
holds for well-behaved callers. Real access control arrives with the hub, where the
channel is already the unit of access control (ADR-0004).

**7. Several people, each with their own state. Fits as-is.** Each person is a participant
with `kind: human`, with their own address channel, their own cursors, and their own
`cynapse.handled` on their own inbox. Nothing in the store assumes a single owner. The
"owner" of an address channel is per channel, not global.

**8. Registering participants. New concept: participant lifecycle, written as entries.**
See *Registration surface* below. **Session liveness is asserted by the runtime, never
measured by cynapse.** It is a status, `live` or `retired`, and the resolver ignores
retired participants. A retired participant is never deleted, because entries name it as
their author. A runtime that crashes without retiring its sessions reconciles when it
starts: it lists what it registered, and retires what it no longer runs. Only the runtime
can tell whether a session is alive, because only it runs the session.

cynapse does not measure presence with a lease that lapses without renewal. Leases
(ADR-0006) are for coordination, such as who holds a task, not for whether a session is
alive. Keeping them apart means no heartbeat renews anything every few seconds, so the
conflict a heartbeat would raise with ADR-0006, where every state transition is an entry,
does not arise.

**9. Project addressing. Fits ADR-0012 directly. The runtime resolves the native ID;
cynapse owns the key built from it.** A repository's address channel is keyed by its
store's native ID, such as a GitHub repository's `node_id`, and its handle is the readable
reference (`gh:cyberuni/cynapse`).
Two checkouts of one repository resolve the same `node_id`, so they derive the same
`UUIDv5`, and `createChannel` with an existing key is a no-op. The channel's UUID is the
opaque key other tools use. Resolving the remote to a `node_id` needs the store's API, so
the runtime does it (`gh repo view --json id`) and passes the ID in, because cynapse never
calls a store (ADR-0011). **The key format is cynapse's.** The runtime passes the store and
the native ID, and cynapse builds the key string from them, so two runtimes that resolve
the same ID derive the same key. A runtime never spells the key itself, because a second
runtime spelling it differently would open a second channel for the same repository. A repository with no hosted remote has no native ID, so cynapse
registers an address for it, as ADR-0012 does for a folder. The root commit SHA is not
used as the key. Every fork shares it, so a fork and its upstream would collide in one
channel.

**10. Knowing that something arrived. New concept: a store-wide change token, polled.
cynapse never wakes anyone.** `unread(participant)` already answers "is there anything
for me", but it joins over entries on each call, which is too much for a runtime that
polls for every session every few seconds. Add `changes(since?)`, which returns an opaque
token and the channels whose `lastSeq` moved after `since`. The runtime keeps the token,
polls cheaply, and calls `unread` or `entries` only for the channels that changed and that
it cares about. On SQLite, the token is a counter in the store, bumped in the same
`BEGIN IMMEDIATE` transaction as each append. A hub will issue its own.

The token is **not an order of entries**. It says only "something changed since you last
asked", so it doesn't bring back the global order ADR-0003 rejected. It is local to one
store and opaque, so callers can't compare or merge tokens. There is no subscription and
no push, because that needs a long-lived process, which ADR-0007 rules out. A runtime
that wants lower latency can watch the database file itself as a hint and then call
`changes`. That is the runtime's choice, and cynapse doesn't support it.

`ChannelTraits.wake` stays, and is clarified rather than changed: it is advice *to the
runtime* about whether an entry landing in this channel deserves waking a member. ADR-0005
lists "whether members are woken" as a trait and doesn't say who wakes them. This ADR
settles that it is never cynapse.

### Registration surface

What an outside runtime calls, on the `Store` interface and as CLI commands under
`cynapse participant`:

- `registerParticipant({ key, kind, name, registeredBy })`. `key` is namespaced by the
  registering unit (`cyberlegion:unit/37757199c374e73a`, `cyberlegion:role/reviewer`). The
  participant's ID is `UUIDv5(key)`, so re-registering is a no-op, and registering the
  same key with a different kind fails with `id_conflict`, the same rule channels follow
  (ADR-0004). One transaction creates or revives the participant, creates its address
  channel (keyed by the participant ID, owned by it, handle from `name`), and appends
  `cynapse.participant.registered` there. It returns the participant with its address
  channel.
- `retireParticipant(id, author)` sets the status to `retired` and appends
  `cynapse.participant.retired`. The address channel stays readable. Registering the key
  again revives the participant.
- `renameParticipant(id, name, author)` works like a channel rename: the old handle stays
  as an alias.
- `resolveAddress(name, { kinds? })` resolves a name to one live participant, or fails
  as need 1 describes.
- `participants({ status?, registeredBy? })` lists them, so a runtime can reconcile what
  it registered against what it is running.

The registering unit is itself a participant (`kind: service`). cynapse records which unit
registered each participant, and never calls the unit back. The dependency runs one way,
from the runtime to cynapse.

### What stays with the runtime

cynapse holds the messages, the addresses and the read state. The runtime keeps everything
that needs a running session or a call to a store:

- **Waking.** The doorbell, on top of cyber-mux, decided from the change token and
  `ChannelTraits.wake` (need 10).
- **Session liveness.** Asserting `live` and `retired`, observing whether a session is
  still running, and reconciling after a crash when the runtime starts (need 8).
- **Session binding and claims.** Which session acts as which participant, and which pane
  the doorbell rings, last claim wins (need 2).
- **Native-ID resolution.** Calling the store to turn a remote into its native ID (need 9).
- **The migration plan.** When and in what order the runtime moves its own messaging onto
  cynapse.

### Integration contract

**Both, with the library as the contract and the CLI as its projection.** A runtime
built on Node depends on the package and calls the `Store` interface in process. Its poll
loop and registration then cost no process spawns, and it gets typed errors. Agents use the
CLI, whose `--json` output has the same shapes the library returns, so a reader of either
sees one model. A runtime codes against `Store` and the functions above, never against
`SqliteStore`, so the hub can replace the engine underneath it.

These must be published before a runtime depends on cynapse:

1. **A schema version and forward migrations.** ADR-0009 shipped a rename with no
   migration, because no real database existed. Once a runtime writes real mail, that is
   no longer acceptable.
2. **ADR-0012's key scheme and address channels,** built and released. Channel IDs are
   written into every entry, so this has to be settled before a runtime writes real
   channels.
3. **The registration surface and `resolveAddress`,** with participant IDs derived from
   registration keys. `#ensureParticipant` stops creating participants silently on send.
4. **The messaging additions:** `excludeTags` and `excludeAuthors` in `ViewFilter`,
   followed threads in `unread`, `changes(since)`, and `cynapse entry wait`.
5. **Stable error codes and exit codes** for `ambiguous_address` (with its candidates in
   `--json`), `unknown_address`, and a wait timeout. A runtime branches on these.
6. **A semver release that isn't `0.0.0`,** whose release notes declare the `Store`
   interface, the `--json` shapes and the `cynapse.*` entry types this ADR adds
   (`participant.registered`, `participant.retired`, `awaiting-reply`, `handled`) as the
   public contract. From then on, changing them is a breaking change.
7. **The database location contract.** `$CYNAPSE_HOME` decides which store a runtime and
   its agents share. A runtime that launches agents must pass it on, or they write to
   different databases.

### Expensive to unwind, cheap to revisit

Expensive to unwind: participant IDs as `UUIDv5(registration key)`, because entry authors
are written forever. Where traffic goes: work traffic on the work item's channel, direct
traffic on the addressee's address channel. The key format built from a native ID, because
channel IDs are written into every entry. The
cursor belongs to the participant, not to the session. A conversation lives in the channel
where it began. cynapse never wakes anyone, and never measures session liveness. The library-first
contract, once released.

Cheap to revisit: exact matching in `resolveAddress` (prefix matching could be added
later), followed threads and which entries count towards them, `cynapse.handled` as a tag
rather than a state record, the poll interval and how the token is spelled, and whether
cynapse shows a runtime's claims as state records.

## Considered options

- **Work traffic on work channels, direct traffic on address channels, with a registry,
  followed threads and a change token (chosen).**
- **All traffic on address channels.** Rejected. Most traffic is about a work item, so
  every reply would cross into the other party's view through followed threads, and the
  exchange about one item would be scattered across the address channels of everyone
  involved.
- **Presence leases with a TTL for session liveness.** Rejected. Leases are for
  coordination, the runtime is the only one that knows whether its session runs, and a
  renewal every few seconds would either flood the channel with entries or need an
  exemption from ADR-0006.
- **A mailbox separate from channels.** Rejected. ADR-0002 already settled that mail is an
  addressed entry in a channel, and a second structure would need its own cursors, tags
  and history.
- **Two-party DM channels for conversations.** Rejected for now. ADR-0012 removed DMs, and
  everything a DM would give here (a shared thread, read by both parties) comes from a
  thread in the addressee's channel plus followed threads.
- **cynapse pushes or wakes recipients.** Rejected. It needs a daemon, which ADR-0007
  rules out, and the decision to wake belongs to the runtime, which knows its sessions.
- **The runtime keeps its own registry, and cynapse resolves names through it.** Rejected.
  cynapse would then depend on the runtime, the reverse of the settled direction, and
  every other unit would need its own resolver.

## Consequences

- The participant becomes a first-class record with history: registrations, retirements
  and renames are entries in its address channel, which closes the gap where participant
  changes are the one kind of metadata not written as entries.
- `addTags` gets its first rule that depends on the caller: only the owner may set
  `cynapse.handled`.
- `unread` gets more expensive, because it adds the followed-thread count. The change
  token keeps the frequent poll cheap, so `unread` is called only after something changed.
- cyberlegion's messaging can move onto cynapse in stages: register participants first,
  then send through cynapse, work traffic to work channels and direct traffic to address
  channels, then retire its own store. That plan belongs to cyberlegion.
- Leases stay a coordination tool. Session liveness never renews anything, so no heartbeat
  has to be exempted from ADR-0006's rule that every transition is an entry.

## Related

- [ADR-0002](0002-own-only-communication-with-no-other-home.md), [ADR-0003](0003-entry-identity-and-order.md), [ADR-0004](0004-stream-identity-handles-and-anchors.md), [ADR-0005](0005-consumer-defined-types-tags-and-traits.md), [ADR-0006](0006-state-views-and-lifecycle.md), [ADR-0007](0007-stock-sqlite-outside-the-repository.md), [ADR-0011](0011-cynapse-stores-only-what-no-other-store-can.md), [ADR-0012](0012-channels-are-keyed-by-subject.md).
- Issue [#30](https://github.com/cyberuni/cynapse/issues/30), and [cyberuni/cyberlegion#20](https://github.com/cyberuni/cyberlegion/issues/20).
