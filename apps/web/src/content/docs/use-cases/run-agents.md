---
title: Run agents from a runtime
description: "A runtime registers durable roles and one participant per session, polls the change token to decide whom to wake, and retires what it no longer runs after a restart."
---

A runtime such as cyberlegion launches agent sessions and keeps them talking. It uses the
library in process. Its job against cynapse has three parts: register who can be
addressed, notice what arrived, and keep the registry true to what actually runs.

## Stories

- **As a runtime,** I want to register each session at start and retire it when it ends,
  so that addresses resolve only to sessions that run.
- **As a runtime,** I want to learn cheaply which channels moved, so that I wake only the
  agents with something new.
- **As a runtime that crashed,** I want to find the participants I registered but no
  longer run, so that stale addresses stop resolving.
- **As a role,** I want my mail to wait for whichever session plays me next, so that a
  session ending loses nothing.

## Use case

| | |
| --- | --- |
| Actors | The runtime, registered as a `service`; the agents it runs |
| Goal | Every live participant the runtime registered is one it runs, and new entries reach the right session |
| Preconditions | Every process the runtime starts uses the same `CYNAPSE_HOME` |
| Result | Running sessions and durable roles are live; ended sessions are retired, with their history kept |

**Main flow**

1. On start, the runtime registers itself as a `service`.
2. It registers each **durable role**, such as `reviewer`, under a stable key. Mail for the
   role goes to the role's address channel and outlives any session.
3. It registers each **session** that must be addressable on its own, under a key used only
   once, such as `cyberlegion:unit/<instance id>`.
4. It polls `changes(since)`. For each channel that moved, it reads the entries after each
   reader's cursor: the owner of an address channel, or the members of a work channel.
5. It wakes the session that acts for each reader with something new. Which session plays
   a role is the runtime's own record.
6. When a session ends, the runtime retires its participant.
7. After a crash, on restart, it lists the live participants it registered and retires
   those it no longer runs.

**Alternatives**

- **1a. The runtime registers again on every start.** Registering a live key writes nothing,
  so this is safe.
- **3a. A session key is reused.** Registering a retired key revives the same participant,
  with its history and cursors. Give every session its own key; give a role a stable one.
- **3b. Two live sessions share a name.** Sending to that name fails with exit `4`. Give
  sessions unique names, or send to the role.
- **6a. Mail arrives for a retired session.** Sending by name fails with exit `5`. The
  session's address channel and history stay readable.

There is nothing to keep alive. A participant stays `live` from registration until it is
retired; cynapse doesn't expire it and doesn't measure whether the session runs.

## Scenario: a session dies during a crash

This scenario is a library script. Save it as `lifecycle.mjs` in a directory with `cynapse`
installed.

```js
import { CynapseError, openStore } from 'cynapse'

const store = openStore({ path: process.env.CYNAPSE_DB })

// Start: the runtime registers itself, a durable role, and one participant per session.
const runtime = store.registerParticipant({ key: 'demo:runtime', kind: 'service', name: 'runtime' }).participant
const register = (key, name) =>
  store.registerParticipant({ key, kind: 'agent', name, registeredBy: runtime.id }).participant
const reviewer = register('demo:role/reviewer', 'reviewer')
const scoutA = register('demo:unit/7f3a', 'scout-7f3a')
const scoutB = register('demo:unit/91c2', 'scout-91c2')

store.append(store.resolveAddress('scout-7f3a').channel.id, {
  author: reviewer.id,
  type: 'demo.ask',
  body: 'Status of the crawl?',
})

// The runtime crashes and restarts. It still runs scout-91c2; scout-7f3a is gone.
const running = new Set([runtime.id, reviewer.id, scoutB.id])
for (const participant of store.participants({ registeredBy: runtime.id, status: 'live' })) {
  if (running.has(participant.id)) continue
  store.retireParticipant(participant.id, runtime.id)
  console.log(`retired ${participant.name}`)
}

// A retired session no longer resolves, and its history stays readable.
try {
  store.resolveAddress('scout-7f3a')
} catch (error) {
  if (error instanceof CynapseError) console.log(`scout-7f3a: ${error.code}`)
}
const history = store.entries('scout-7f3a', { types: ['cynapse.participant.*', 'demo.*'] })
console.log(history.map((e) => `${e.channel}#${e.seq} ${e.type}`).join('\n'))

// The role still resolves, whichever session acts as it.
console.log(`reviewer -> ${store.resolveAddress('reviewer').channel.handle}`)

// Registering a live key again writes nothing; registering a retired key revives it.
const before = store.getChannel('scout-7f3a').stats.lastSeq
register('demo:unit/91c2', 'scout-91c2')
const revived = register('demo:unit/7f3a', 'scout-7f3a')
console.log(`scout-7f3a is ${revived.status} again, same id: ${revived.id === scoutA.id}; seq ${before} -> ${store.getChannel('scout-7f3a').stats.lastSeq}`)

store.close()
```

**Given** the runtime registered itself, the `reviewer` role and two sessions, and the
reviewer asked `scout-7f3a` a question.

**When** the runtime restarts running only `scout-91c2`, and retires what it no longer runs.

**Then** `scout-7f3a` stops resolving, its history stays, the role still resolves, and only
the revival of a retired key writes anything:

```console
$ CYNAPSE_DB="$(mktemp -d)/cynapse.db" node lifecycle.mjs
retired scout-7f3a
scout-7f3a: unknown_address
scout-7f3a#2 cynapse.participant.registered
scout-7f3a#3 demo.ask
scout-7f3a#4 cynapse.participant.retired
reviewer -> reviewer
scout-7f3a is live again, same id: true; seq 4 -> 5
```

The last line shows why session keys must not be reused: the revived `scout-7f3a` is the
same participant, with the old question still in its address channel.

For the polling half of the flow, steps 4 and 5, see
[Use the library](/cynapse/guides/library/#4-to-6-notice-what-arrived).

## Related

- [Participants](/cynapse/concepts/participants/#registration): registration, retirement,
  revival.
- [cynapse and the runtime](/cynapse/design/runtime/): which jobs stay with the runtime.
