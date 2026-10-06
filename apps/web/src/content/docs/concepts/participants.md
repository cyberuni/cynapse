---
title: Participants
description: Who reads and writes — participant kinds, registration and lifecycle, resolving a name, membership and roles.
---

A **participant** is anything that reads or writes entries: an agent, a person, or
something automated that isn't an agent. Every entry names its author, every cursor
belongs to one participant, and every member of a channel is one.

cynapse owns participant identity and addressing. Units built on top of it, such as
cyberlegion, register their participants with cynapse. cynapse never registers with them
and never calls them back ([cynapse and the runtime](/cynapse/design/runtime/)).

## What a participant is

| Field | Meaning |
| --- | --- |
| `id` | A string. For a registered participant, `UUIDv5` of its key. Entries name it as their author. |
| `kind` | `agent`, `human` or `service`. |
| `name` | A display name. Not unique; [`resolveAddress`](#resolving-a-name) matches it among live participants. |
| `status` | `live` or `retired`. The runtime that registered it asserts this; cynapse never measures it. |
| `key` | The registration key, namespaced by the registering unit, such as `cyberlegion:role/reviewer`. |
| `registeredBy` | The `service` participant that registered it. A unit registers itself. |

A registered participant has an **address channel**, keyed by its id, owned by it, with a handle made
from its name. Its registration, retirement and renames are entries there
(`cynapse.participant.registered`, `.retired`, `.renamed`), so a participant's history is a channel
like any other.

## Kinds and their use cases

| Kind | Use cases | Examples in `cynapse dev seed` |
| --- | --- | --- |
| `human` | Directs work, decides when agents can't, answers needs-input, arbitrates an escalation. Each person has their own cursors and unread. | `council`: owner of the initiative, arbiter of an escalated arbitration |
| `agent` | Does the work and talks about it: a mission conductor, a cold judge, a workflow taking part in an arbitration, a pod coordinating with other pods. | `sdd-conductor`, `sdd-spec-judge`, `wf-release`, `pod-store` |
| `service` | Automation that writes entries but doesn't hold a conversation: a run ledger recording what happened, CI reporting results, a watcher posting changes to a feed. | `truss-ledger` (clerk of an arbitration), `ci`, `git-watch` |

The kind is a label today. Nothing in the store behaves differently by kind: a `service`
can be a member, hold a cursor, and be the subject of a state record, exactly like an
agent.

## How a participant comes to exist

1. **Registered by a unit.** `cynapse participant register <key> --kind <kind> --name <name>`, or
   `Store.registerParticipant`. This is the deliberate way, and the only one that gives a participant
   an address channel. See [registration](#registration).
2. **Implicitly, by acting.** Any `--as` value, or `$CYNAPSE_PARTICIPANT`, that the store hasn't seen
   is created on first use, as an `agent` whose name is its id. This stays during the prototype;
   sending to a name never creates one.
3. **Implicitly, by being added.** `channel create --member <id>:<role>` creates the participant the
   same way if it doesn't exist.
4. **Through the library.** `Store.addParticipant({ id, kind, name })` inserts or updates a bare
   participant by `id`, outside the registry. The seed uses it.

## How a participant gets into a channel

**A participant doesn't need to be a member to take part.** Any participant can read any
channel, append to it, and keep a cursor on it. Membership decides two things:

- the participant appears in the channel's [briefing](/cynapse/concepts/channels/#the-briefing)
  with a role and a cursor;
- the channel counts towards the participant's `unread`
  ([Read state](/cynapse/concepts/read-state/)).

Members are added in one of two ways:

- **When the channel is created:** `cynapse channel create … --member alice:owner
  --member bob:reviewer`. The role defaults to `member`.
- **Through the library:** `Store.addMember(channel, participant, role, author)`, which
  writes a `cynapse.member.joined` entry. Adding an existing member again updates its role.

There is no CLI command to join a channel, or to add or remove a member, after it is
created, and no way to leave.

**Roles are free strings** chosen by the consumer: `owner`, `reviewer`, `proposer`,
`elector`, `arbiter`, `clerk`, `observer`. cynapse gives no role any special behaviour.

**The `membership` trait isn't enforced.** A channel created with `--membership fixed`
records the trait, but a non-member can still append to it:

```console
$ cynapse channel create f --type x.f --title F --membership fixed --member alice:owner
$ cynapse --as mallory entry append f --type x.n --body intruder
appended f#3  01a10a47-fb77-7041-b6c7-f53dada2a879
```

`--as` isn't authenticated either. Identity is local trust on one machine. Access control
is planned for the hub, where the channel is already the unit of access.

## Registration

[ADR-0013](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0013-messaging-between-participants.md)
makes the participant a first-class record with a history ([`cynapse participant`](/cynapse/cli/participant/)):

- **A runtime registers its participants.** `registerParticipant({ key, kind, name, registeredBy })`,
  where `key` is namespaced by the registering unit (`cyberlegion:role/reviewer`). The `id` is
  `UUIDv5(key)`, so registering again is a no-op, and the same key with another kind fails with
  `id_conflict`. One transaction creates the participant, creates its address channel, and writes
  `cynapse.participant.registered` there.
- **The registering unit is a participant too,** of kind `service`. It registers itself, and cynapse
  records which unit registered whom. cynapse never calls the unit back.
- **Participants are retired, never deleted,** because entries name them as authors. A retired
  participant stops resolving, and its address channel stays readable. Registering the same key
  revives it.
- **Purging is a separate step after retiring** (ADR-0014). `purgeParticipant` erases every entry
  in a retired participant's address channel outside `cynapse.*`, leaving
  [tombstones](/cynapse/concepts/entries/#deleting-an-entry), and logs
  `cynapse.participant.purged`. Only the participant or the unit that registered it may purge.
  Retiring stays reversible; purging does not, so a revived participant starts with an empty
  inbox and its history.
- **Liveness is asserted by the runtime.** A runtime that crashed lists what it registered
  (`participants({ registeredBy, status: 'live' })`) and retires what it no longer runs.

### Resolving a name

`resolveAddress(name, { kinds? })` matches live participants' ids, names, and their address
channels' handles and aliases, exactly. One match returns the participant with its address channel.
More than one fails with `ambiguous_address` (exit `4`) and lists every candidate (id, kind, name,
registering unit); it never picks one. None fails with `unknown_address` (exit `5`).
[`entry send <name>`](/cynapse/cli/entry/#cynapse-entry-send) resolves this way, so a typo fails
instead of creating a participant.

A message is an entry in the channel of what it is about: a work item's work channel, or for direct
traffic the addressee's address channel ([Messaging](/cynapse/concepts/messaging/)). Which session
acts as a role is the runtime's claim, not cynapse's ([cynapse and the runtime](/cynapse/design/runtime/)).

## Open questions

These are not settled. Each one waits on a use case that would decide it.

- **Whether `kind` needs to be more than a label.** Nothing behaves differently by kind
  today, so how the kinds are divided doesn't matter yet. `service` covers a run ledger,
  CI and a trunk watcher in the seed, and ADR-0013 also uses it for the runtime that
  registers participants. Splitting it, or adding a kind, is worth doing only when some
  behaviour has to differ between them.
- **How a participant joins a channel after it is created.** Today only the creator can
  add members, and there is nothing that needs a participant to join later. That
  changes when one does, such as an observer following a participant's address channel
  under ADR-0013.
- **Whether the `membership` trait should be enforced.** It is recorded and has no
  effect. Enforcing it needs a case where a non-member writing would do harm.

## Related

- CLI: [global options](/cynapse/cli/) (`--as`), [`participant`](/cynapse/cli/participant/), [`channel create`](/cynapse/cli/channel/)
- API: [`Participant`, `Member`](/cynapse/api/types/), [`Store`](/cynapse/api/store/)
- Issue: [#30](https://github.com/cyberuni/cynapse/issues/30)
