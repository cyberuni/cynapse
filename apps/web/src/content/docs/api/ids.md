---
title: Ids and errors
description: UUIDv7 and UUIDv5 helpers, the fixed namespace, and CynapseError with its exit codes.
---

```ts
import {
  uuidv7, uuidv5, timestampOf, isUuid, CYNAPSE_NAMESPACE,
  CynapseError, EXIT_OK, EXIT_FAILURE, EXIT_USAGE, exitCodeFor, renderCliError,
} from 'cynapse'
```

## Ids

Channels and entries are identified by UUIDs. Entries are always UUIDv7, minted by the writer; a channel
is UUIDv7 unless it is derived (see [`createChannel`](/cynapse/api/store/#createchannelinput)).

### `uuidv7(now?)` → `string`

A UUIDv7 (RFC 9562): 48 bits of Unix milliseconds, then a 12-bit counter, so ids minted in the same
millisecond by one process still sort in mint order. `now` is milliseconds since the epoch, defaulting
to `Date.now()`. Arrival order across writers is the job of `seq`, not the id.

### `timestampOf(id)` → `number`

The Unix millisecond timestamp a UUIDv7 carries. This is where an entry's `createdAt` comes from.

```ts
new Date(timestampOf(entry.id)).toISOString() === entry.createdAt
```

### `uuidv5(name, namespace?)` → `string`

A name-based UUIDv5 (SHA-1): the same name in the same namespace always gives the same id. `namespace`
defaults to `CYNAPSE_NAMESPACE`. This is how `--key` and `--anchor` make channel creation idempotent.

```ts
uuidv5('dm:a:b') === uuidv5('dm:a:b')   // true: two agents derive the same channel
```

### `CYNAPSE_NAMESPACE`

`'0199a6c4-5b1e-5c3a-9d2f-6e7c8b9a0d1e'` — the namespace cynapse derives channel ids in. It is fixed
forever: changing it would give every derived channel a new identity.

### `isUuid(value)` → `boolean`

True for any value in canonical `8-4-4-4-12` hex form, case-insensitive. The store uses it to tell a
channel or entry UUID from a handle, which is why a handle may not look like a UUID.

## Errors

### `CynapseError`

A failure raised deliberately, with an exit code a caller can branch on.

```ts
class CynapseError extends Error {
  readonly exitCode: number
  /** A stable, machine-readable reason, for callers that branch on more than the exit code. */
  readonly code?: string
  constructor(message: string, options?: { exitCode?: number; cause?: unknown; code?: string })
}
```

`exitCode` defaults to `EXIT_FAILURE`. The store throws `CynapseError` for a missing channel or entry,
a taken or invalid handle, a missing view, a cross-channel parent and a non-UUID id. Conflicts carry
`code: 'id_conflict'`; `cynapse gui` adds `port_in_use` and `gui_not_installed`.

```ts
try {
  store.append('notes', { id, author: 'alice', type: 'demo.note', body: 'changed' })
} catch (error) {
  if (error instanceof CynapseError && error.code === 'id_conflict') {
    // the id was already used with a different payload
  }
}
```

### Exit codes

| Constant | Value | Meaning |
| --- | --- | --- |
| `EXIT_OK` | `0` | Success, including `--help` and `--version`. |
| `EXIT_FAILURE` | `1` | The command ran and failed. |
| `EXIT_USAGE` | `2` | Usage error: bad flag, bad option value, no participant. |

The set is small and stable on purpose: anything new needs a reason a caller can act on differently. See
the [CLI overview](/cynapse/cli/#exit-codes).

### `exitCodeFor(error)` → `number`

The exit code for any thrown value: a `CynapseError`'s own, and `EXIT_FAILURE` for everything else
(unknown throws are ordinary failures, never usage).

### `renderCliError(error)` → `string`

One line, no stack. The message of an `Error`, with its cause's message appended after a colon when the
cause adds information; `String(error)` for anything else. This is what the CLI prints to stderr.
