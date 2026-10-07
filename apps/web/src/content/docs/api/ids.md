---
title: Ids and errors
description: UUIDv7 and UUIDv5 helpers, the fixed namespace, and CynapseError with its exit codes.
---

```ts
import {
  uuidv7, uuidv5, timestampOf, isUuid, CYNAPSE_NAMESPACE,
  CynapseError, EXIT_OK, EXIT_FAILURE, EXIT_USAGE, EXIT_TIMEOUT, EXIT_AMBIGUOUS_ADDRESS, EXIT_UNKNOWN_ADDRESS, errorCodeFor, exitCodeFor, helpFor, renderCliError,
} from 'cynapse'
```

## Ids

Channels and entries are identified by UUIDs. An entry is a UUIDv7 minted by the writer, unless the caller
supplies an `id`, which may be any UUID. A channel is a UUIDv7 unless it is derived (see
[`createChannel`](/cynapse/api/store/#createchannelinput)).

### `uuidv7(now?)` → `string`

A UUIDv7 (RFC 9562): 48 bits of Unix milliseconds, then a 12-bit counter, so ids minted in the same
millisecond by one process still sort in mint order. `now` is milliseconds since the epoch, defaulting
to `Date.now()`. Arrival order across writers is the job of `seq`, not the id.

### `timestampOf(id)` → `number`

The Unix millisecond timestamp a UUIDv7 carries. This is where an entry's `createdAt` comes from. An
entry whose caller supplied a non-v7 `id` has `createdAt` equal to `recordedAt` instead.

```ts
new Date(timestampOf(entry.id)).toISOString() === entry.createdAt // for a minted id
```

### `uuidv5(name, namespace?)` → `string`

A name-based UUIDv5 (SHA-1): the same name in the same namespace always gives the same id. `namespace`
defaults to `CYNAPSE_NAMESPACE`. This is how `--key`, `--anchor` and a subject make channel creation
idempotent.

```ts
uuidv5('dm:a:b') === uuidv5('dm:a:b')   // true: two agents derive the same channel
```

### `CYNAPSE_NAMESPACE`

`'0199a6c4-5b1e-5c3a-9d2f-6e7c8b9a0d1e'` is the namespace cynapse derives channel ids in. It is fixed
forever: changing it would give every derived channel a new identity.

### `isUuid(value)` → `boolean`

True for any value in canonical `8-4-4-4-12` hex form, case-insensitive. The store uses it to tell a
channel or entry UUID from a handle, which is why a handle may not look like a UUID.

## Subjects

A subject is the thing a channel is about, identified in the store that holds it (ADR-0012).

```ts
interface SubjectId {
  store: string     // lowercase letters, digits, '.' and '-', starting with a letter; 'cynapse' for ids cynapse mints
  nativeId: string  // the id exactly as the store returns it; non-empty, no whitespace, case kept
}
```

### `channelKey(subject)` → `string`

The key a subject's channel is derived from: `subject:<store>:<nativeId>`. The format is fixed. It throws
a `CynapseError` for an invalid `store` or `nativeId`.

### `channelIdOf(subject)` → `string`

The channel id of a subject: `uuidv5(channelKey(subject))`.

```ts
channelIdOf({ store: 'gh', nativeId: 'R_1' }) // the id of that repository's channel
```

## Errors

### `CynapseError`

A failure raised deliberately, with an exit code a caller can branch on.

```ts
class CynapseError extends Error {
  readonly exitCode: number
  /** A stable, machine-readable reason, for callers that branch on more than the exit code. */
  readonly code?: string
  /** Structured facts a caller acts on, such as an ambiguous address's `candidates`. */
  readonly details?: Record<string, unknown>
  /** The next step to suggest; without one, `helpFor` gives the code's default. */
  readonly help?: string
  constructor(
    message: string,
    options?: { exitCode?: number; cause?: unknown; code?: string; details?: Record<string, unknown>; help?: string },
  )
}
```

`exitCode` defaults to `EXIT_FAILURE`. The store throws `CynapseError` for a missing channel or entry,
a taken or invalid handle, a missing view, a cross-channel parent and a non-UUID id. A missing channel,
entry, view or participant carries `code: 'not_found'` and a conflict `code: 'id_conflict'`. Other codes
the store raises are `ambiguous_address`, `unknown_address`, `not_address`, `not_owner`, `invalid_token`,
`foreign_token` and `schema_too_new`; `cynapse gui` adds `port_in_use` and `gui_not_installed`. The
[public contract](/cynapse/public-contract/#error-codes) and the [CLI overview](/cynapse/cli/#errors) list
them all.

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
| `EXIT_TIMEOUT` | `3` | `entry wait` ran out of time with no reply. Waiting again may still get one. |
| `EXIT_AMBIGUOUS_ADDRESS` | `4` | `resolveAddress` matched more than one live participant (`ambiguous_address`). |
| `EXIT_UNKNOWN_ADDRESS` | `5` | `resolveAddress` matched no live participant (`unknown_address`). |

The set is small and stable on purpose: anything new needs a reason a caller can act on differently. See
the [CLI overview](/cynapse/cli/#exit-codes).

### `exitCodeFor(error)` → `number`

The exit code for any thrown value: a `CynapseError`'s own, and `EXIT_FAILURE` for everything else
(unknown throws are ordinary failures, never usage).

### `errorCodeFor(error)` → `string`

The machine-readable reason for any thrown value: a `CynapseError`'s own `code`, otherwise `usage` when
its exit code is `EXIT_USAGE` and `failure` for everything else.

### `helpFor(error)` → `string`

The suggested next step for any thrown value: a `CynapseError`'s own `help`, otherwise the default for
its code. A throw cynapse did not raise on purpose is treated as a bug and points at the issue tracker.
Every value gets one.

### `renderCliError(error, format?)` → `string`

No stack. The message of an `Error`, with its cause's message appended after a colon when the
cause adds information; `String(error)` for anything else, behind an `error: ` label, then a
`help: ` line from `helpFor`. With `format` `'json'` it is `{ "error": { "code", "message", "help", ...details } }`,
pretty-printed like other `--json` output, the code from `errorCodeFor`. This is what the CLI prints to stdout on failure.
