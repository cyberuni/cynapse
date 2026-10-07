---
title: Use the library
description: "A runtime's path end to end with the cynapse library: open a store, register agents, open a work channel, relay a direct message, poll for changes, wait for a reply, and handle errors."
---

A runtime that launches agents usually runs on Node, and calls cynapse in process instead
of spawning the CLI. It gets the same model with typed results and errors, and a poll costs
no process start. This guide builds one runnable file that does a runtime's job: register
two agents, relay a question between them, notice it with the change token, and wait for
the answer.

## Before you start

You need Node.js 22.13 or later. Make a directory and install the package:

```bash
mkdir cynapse-runtime && cd cynapse-runtime
npm install cynapse
```

Two things to know about the API:

- **Every `Store` method is synchronous.** It returns its result directly, not a Promise.
  Each call is one short SQLite transaction.
- **Code against the `Store` interface,** which `openStore` returns, not against the
  `SqliteStore` class. `Store` is the [public contract](/cynapse/public-contract/).

## The whole file

Save this as `runtime.mjs`. The sections below explain each step.

```js
import { CynapseError, HANDLED_TAG, openStore } from 'cynapse'

// 1. Open the store. Without a path it opens $CYNAPSE_HOME/cynapse.db.
const store = openStore({ path: process.env.CYNAPSE_DB })

// 2. Register the runtime itself, then the agents it runs.
const runtime = store.registerParticipant({ key: 'demo:runtime', kind: 'service', name: 'runtime' }).participant
const register = (key, name) =>
  store.registerParticipant({ key, kind: 'agent', name, registeredBy: runtime.id }).participant
const reviewer = register('demo:role/reviewer', 'reviewer')
const builder = register('demo:agent/builder', 'builder')

// 3. Open the work channel for the issue, keyed by its GitHub node_id.
const work = store.createChannel({
  handle: 'gh:acme/app/12',
  type: 'demo.issue',
  title: 'Login fails after reset',
  author: builder.id,
  subject: { store: 'gh', nativeId: 'I_kwDOAbc012' },
})
store.addMember(work.id, builder.id, 'author', builder.id)
store.addMember(work.id, reviewer.id, 'reviewer', builder.id)

// 4. Take a change token before anything is sent.
let { token } = store.changes()

// 5. The builder asks the reviewer directly. A caller-chosen id makes a retry safe.
const { channel: inbox } = store.resolveAddress('reviewer')
const ask = store.append(inbox.id, {
  id: crypto.randomUUID(),
  author: builder.id,
  type: 'demo.ask',
  body: 'Can you review the fix today?',
})
console.log(`sent ${ask.channel}#${ask.seq}`)

// 6. The runtime polls. For each channel that moved, it finds who has something new.
const changed = store.changes(token)
token = changed.token
for (const { channelId, handle } of changed.channels) {
  const channel = store.getChannel(channelId)
  const readers = channel.owner ? [channel.owner] : channel.members.map((m) => m.participant)
  for (const reader of readers) {
    const fresh = store.entries(channelId, { unreadFor: reader, excludeTypes: ['cynapse.*'] })
    if (fresh.length) console.log(`${handle}: ${fresh.length} new for ${reader}; wake it`)
  }
}

// 7. The builder waits for a reply by polling the thread.
async function waitForReply(entry, waiter, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const [reply] = store.entries(entry.channelId, {
      root: entry.root ?? entry.id,
      afterSeq: entry.seq,
      excludeAuthors: [waiter],
      limit: 1,
    })
    if (reply) return reply
    if (Date.now() >= deadline) return undefined
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}
const waiting = waitForReply(ask, builder.id, 10_000)

// 8. The reviewer reads its inbox, replies, marks the message handled,
//    and moves its cursor to the last entry it processed.
setTimeout(() => {
  const fresh = store.entries(inbox.id, { unreadFor: reviewer.id, excludeTypes: ['cynapse.*'] })
  for (const message of fresh) {
    store.append(inbox.id, { author: reviewer.id, type: 'demo.answer', parent: message.id, body: 'Yes, after lunch.' })
    store.addTags(message.id, [HANDLED_TAG], reviewer.id)
  }
  store.markRead(inbox.id, reviewer.id, fresh.at(-1).seq)
}, 1000)

const reply = await waiting
console.log(`reply: ${reply?.body}`)

// 9. Errors carry a stable code to branch on.
try {
  store.resolveAddress('reviewr')
} catch (error) {
  if (error instanceof CynapseError && error.code === 'unknown_address') console.log('no such participant')
  else throw error
}

store.close()
```

Run it against a scratch database:

```console
$ CYNAPSE_DB="$(mktemp -d)/cynapse.db" node runtime.mjs
sent reviewer#3
reviewer: 1 new for cd604701-2518-512b-b65e-7253e252004f; wake it
reply: Yes, after lunch.
no such participant
```

Running it again on the same database works too: registering and creating the channel
return what already exists.

## 1. Open the store

`openStore({ path })` opens the SQLite file, creating it and its directory if needed, and
migrates its schema forward. Without `path`, it opens `$CYNAPSE_HOME/cynapse.db`. Agents
the runtime launches must use the same file, so pass `CYNAPSE_HOME` on to them. Call
`store.close()` when you are done.

## 2. Register participants

`registerParticipant` creates the participant and its address channel in one transaction.
The id is a UUID derived from `key`, so registering the same key again returns the same
participant. A unit registers itself as a `service` by leaving out `registeredBy`; every
other participant names the unit that registered it. When a session ends for good,
`retireParticipant(id, author)` stops its name from resolving.

## 3. Open the work channel

`createChannel` with a `subject` derives the channel id from the subject, so every runtime
and agent that opens the channel for this issue gets the same one. Unlike the CLI,
`createChannel` adds no members; call `addMember` for each.

## 4 to 6. Notice what arrived

`changes()` returns a token and the channels that moved. Keep the token, and on each poll
pass it back: `changes(token)` returns only the channels that moved since, and a new token.
For each one, the runtime decides who should hear about it:

- An address channel has an `owner`. Its owner is not a member, so `unread(owner)` doesn't
  count it; read it with `entries(channel, { unreadFor: owner })`.
- A work channel has `members`, each with a cursor.

cynapse never wakes anyone. What "wake it" means, such as ringing a terminal pane, is the
runtime's job, and the channel's `traits.wake` is a hint for it.

## 7. Wait for a reply

The library doesn't export a wait function. Poll the thread for the first entry after the
question that someone else wrote, as `waitForReply` does above. Because the query starts at
the question's `seq`, a reply that arrived before the wait began is found on the first poll.

## 8. Read, reply, mark handled, mark read

- `entries(ref, { unreadFor })` returns entries after the participant's cursor that it
  didn't write. `excludeTypes: ['cynapse.*']` drops the metadata entries.
- A reply names its `parent`, in the same channel.
- `addTags(entry, [HANDLED_TAG], owner)` records that the owner dealt with the message.
  Only the address channel's owner may do it.
- `markRead(ref, participant, seq)` moves the cursor. **Always pass `seq`,** the last entry
  you processed. Without it, the cursor jumps to the channel's latest entry, including
  entries you haven't read.

## 9. Handle errors

Every failure cynapse raises is a `CynapseError`. Branch on `error.code`, such as `not_found`,
`id_conflict`, `unknown_address` or `ambiguous_address`
([Public contract](/cynapse/public-contract/#error-codes)). A store that
waited 10 seconds for another writer's lock throws `busy`; retry it. A database file SQLite
can't use (full disk, I/O error, damaged or not a database) throws `storage`, whose `help`
names the file.

## Next

- [Store](/cynapse/api/store/): every method.
- [Guarantees and limits](/cynapse/concepts/guarantees/): ordering, concurrency and
  delivery.
- [cynapse and the runtime](/cynapse/design/runtime/): which jobs belong to the runtime.
