---
title: Public contract
description: What a runtime may depend on from the first 0.x release — the Store interface, the exports, the --json shapes, the cynapse.* entry types and tags, the error and exit codes, and $CYNAPSE_HOME — and what counts as a breaking change.
---

A runtime such as cyberlegion depends on cynapse from its first release that is not
`0.0.0`. This page lists what that release promises. From then on, changing anything
listed here is a **breaking change**.

cynapse is still on `0.x`. Under semver, a breaking change in `0.x` raises the minor
version (`0.1.x` to `0.2.0`), and the release notes mark it as breaking. A runtime pinned
to `^0.1.0` gets fixes and additions but no breaking change.

The library is the contract, and the CLI is a projection of it (ADR-0013, "Integration
contract"). A runtime on Node calls the `Store` interface in process. Agents call the CLI,
whose `--json` output has the same shapes the library returns.

The lists below are checked against the source by `packages/cynapse/src/public-contract.test.ts`,
so the page cannot drift from what ships.

## The `Store` interface

`Store` in `src/store/types.ts` is the contract, with every type it takes or returns
([Store](/cynapse/api/store/), [Types](/cynapse/api/types/)). Code against `Store`, never
against `SqliteStore`, so that a hub can replace the engine underneath.

`SqliteStore` is covered only as far as its constructor (`SqliteStoreOptions`) and the
`Store` methods it implements. Anything else it has is internal.

The database schema is not part of the contract. Nothing outside `src/store/` reads it.
What is promised is that a database written by one release opens in every later release:
the store migrates it forward in place, and a database newer than the installed cynapse
fails with `schema_too_new` and is never written to.

## Exports

The runtime exports of `cynapse` (`src/index.ts`). Every exported type is in the contract
too, as it is re-exported from `src/store/types.ts`, `src/channel-key.ts`, `src/output.ts`,
`src/refs.ts`, `src/store/open.ts` and `src/dev/seed.ts`.

| Export | What it is |
| --- | --- |
| `openStore` | Opens the store at `resolveDbPath()` or a given path. |
| `resolveDbPath` | `$CYNAPSE_HOME/cynapse.db`, defaulting to `~/.cynapse/cynapse.db`. |
| `SqliteStore` | The SQLite engine behind `Store`. |
| `HANDLED_TAG` | `'cynapse.handled'`, the reserved tag. |
| `channelKey` | The key string of a subject. |
| `channelIdOf` | The channel id of a subject, `UUIDv5(channelKey(subject))`. |
| `uuidv7` | Mints a UUIDv7. |
| `uuidv5` | A name-based UUIDv5 in `CYNAPSE_NAMESPACE` by default. |
| `timestampOf` | The millisecond timestamp in a UUIDv7. |
| `isUuid` | Whether a string is a UUID. |
| `CYNAPSE_NAMESPACE` | The fixed UUIDv5 namespace every derived id uses. |
| `renderRef` | Renders a reference shorthand, such as `gh:cyberuni/cynapse#12`, as a link. |
| `CynapseError` | The error the CLI and the store raise on purpose, with `exitCode`, `code` and `details`. |
| `errorCodeFor` | The `code` string for any thrown value. |
| `exitCodeFor` | The exit code for any thrown value. |
| `renderCliError` | What the CLI prints for an error, as text or `--json`. |
| `EXIT_OK` | Exit code `0`. |
| `EXIT_FAILURE` | Exit code `1`. |
| `EXIT_USAGE` | Exit code `2`. |
| `EXIT_TIMEOUT` | Exit code `3`. |
| `EXIT_AMBIGUOUS_ADDRESS` | Exit code `4`. |
| `EXIT_UNKNOWN_ADDRESS` | Exit code `5`. |
| `createProgram` | Builds the CLI's command tree, for driving the CLI in process. |
| `output` | Prints a value as text or JSON, by the current output format. |
| `printEmpty` | Prints an empty result that names what was empty. |
| `getOutputFormat` | The current output format. |
| `setOutputFormat` | Sets the output format. |
| `readPackageVersion` | The installed cynapse version. |
| `seed` | Builds the example world. The signature is covered; the world it builds is not. |
| `SeedClock` | The clock `seed` lays its timeline out with. |
| `SEED_START` | When the seed's timeline starts. |

## `--json` output shapes

Every command prints the value below under `--json`. A type name means the type in
`src/store/types.ts` with every field it has. A listing is `{ count, items }`. An empty
listing is `{ count: 0, entity, items: [] }`, where `entity` names what was empty, such as
`"channels"`.

| Command | `--json` shape |
| --- | --- |
| `channel create` | `Channel` |
| `channel show` | `Briefing` |
| `channel list` | `{ count, items: Channel[] }` |
| `channel tree` | `ChannelTree[]` |
| `channel rename` | `Channel` |
| `channel resolve` | `Channel` |
| `channel add-key` | `Channel` |
| `channel owner` | `Entry` (the `cynapse.channel.owner-changed` entry) |
| `channel pin` | `Entry` (the `cynapse.pinned` entry) |
| `channel view` | `Entry` (the `cynapse.view.defined` entry) |
| `entry append` | `Entry` |
| `entry send` | `Entry` |
| `entry list` | `{ count, items: Entry[] }` |
| `entry show` | `Entry` plus `links: RenderedRef[]`, one per ref |
| `entry wait` | `Entry` (the reply) |
| `participant register` | `RegisteredParticipant` |
| `participant retire` | `Participant` |
| `participant rename` | `Participant` |
| `participant resolve` | `ResolvedAddress` |
| `participant list` | `{ count, items: Participant[] }` |
| `read` | `Member` |
| `unread` | `{ count, items: UnreadCount[] }` |
| `changes` | `{ token, count, items: ChannelChange[] }`; empty, `{ count: 0, entity, items: [], token }` |
| `tag` | `Entry` (the tagged entry, with its current tags) |
| `state list` | `{ count, items: StateRecord[] }` |
| `state set` | `StateRecord` |
| `state lifecycle` | `Entry` (the `cynapse.state.changed` entry) |
| `gui` | `{ url }` |

A failure under `--json`, including a usage error, prints
`{ "error": { "code", "message", ...details } }` to stdout. `ambiguous_address` adds
`candidates`: `{ id, kind, name, registeredBy? }[]`.

The `dev` commands (`dev seed`, `dev load-test`) are development tools, and their output is
not part of the contract.

## Entry types

Every change the store makes to a channel's metadata or state is also written as a
`cynapse.*` entry in the same transaction. A runtime may read these entries and rely on
their `data`.

| Type | Written by | `data` |
| --- | --- | --- |
| `cynapse.channel.created` | `createChannel`, `registerAddress` | `{ handle, type, title, kind, owner?, subject?, purpose?, anchor? }` |
| `cynapse.channel.renamed` | `renameChannel` | `{ from, to }` |
| `cynapse.channel.subject-added` | `addSubject` | `{ subject: { store, nativeId } }` |
| `cynapse.channel.owner-changed` | `setOwner` | `{ from?, to }` |
| `cynapse.member.joined` | `addMember` | `{ participant, role }` |
| `cynapse.context.added` | `addContext` | `{ ref }` |
| `cynapse.pinned` | `pin` | `{ target, seq }` |
| `cynapse.view.defined` | `defineView` | `{ name, filter }` |
| `cynapse.state.changed` | `setState`, `setLifecycle` | `{ key, kind, from?, to, subject?, entry?, value? }` |
| `cynapse.label` | `addTags`, `removeTags` | `{ target, add?, remove? }` |
| `cynapse.participant.registered` | `registerParticipant` | `{ participant, key, kind, name, registeredBy }` |
| `cynapse.participant.retired` | `retireParticipant` | `{ participant }` |
| `cynapse.participant.renamed` | `renameParticipant` | `{ participant, from, to }` |

The participant entries land on the participant's address channel. That channel has the
type `cynapse.participant`.

Two more names are reserved, though the store never writes them:

- **`cynapse.summary`**, an entry type a consumer writes. `entries(ref, { fromSummary: true })`
  and `entry list --from-summary` start at the latest one.
- **`cynapse.awaiting-reply`**, the state-record kind for a wait that has to outlive the
  process ([Messaging](/cynapse/concepts/messaging/)). It is a convention, and the store
  does not enforce it.

The state-record kind `lifecycle` is reserved too: `setState` refuses it, and only
`setLifecycle` writes it.

## Reserved tags

| Tag | Rule |
| --- | --- |
| `cynapse.handled` | Defined on address channels only. Only the channel's owner may add or remove it, whether through `addTags`, `removeTags`, `cynapse tag` or at append time. Anyone else fails with `not_owner`, and on a work channel it fails with `not_address`. |

## Exit codes

| Code | Constant | Meaning |
| --- | --- | --- |
| `0` | `EXIT_OK` | Success, including `--help` and `--version`. |
| `1` | `EXIT_FAILURE` | The call was well formed but failed. Branch on the `code` string. |
| `2` | `EXIT_USAGE` | A usage error, such as an unknown flag, a bad value or a missing subcommand. Fix the call. |
| `3` | `EXIT_TIMEOUT` | `entry wait` ran out of time with no reply. Waiting again may still get one. |
| `4` | `EXIT_AMBIGUOUS_ADDRESS` | A name matched more than one live participant. |
| `5` | `EXIT_UNKNOWN_ADDRESS` | A name matched no live participant. |

## Error codes

The `code` string under `--json`, and `CynapseError.code` in the library.

| Code | Exit | When |
| --- | --- | --- |
| `usage` | `2` | Any usage error. |
| `failure` | `1` | A failure with no more specific code. |
| `not_found` | `1` | No channel, entry, participant or view matches the reference. |
| `id_conflict` | `1` | An id already exists with different content, such as a registration key with a different kind. |
| `ambiguous_address` | `4` | A name matched more than one live participant; `details.candidates` lists them. |
| `unknown_address` | `5` | A name matched no live participant. |
| `timeout` | `3` | `entry wait` ran out of time. |
| `not_address` | `1` | `cynapse.handled` was used on a work channel. |
| `not_owner` | `1` | Someone other than the owner added or removed `cynapse.handled`. |
| `invalid_token` | `1` | A change token could not be read. |
| `foreign_token` | `1` | A change token came from another store; call `changes` without `--since` to start over. |
| `schema_too_new` | `1` | The database is newer than the installed cynapse. |
| `port_in_use` | `1` | `cynapse gui` could not bind its port. |
| `gui_not_installed` | `1` | `cynapse gui` needs `@cyberuni/cynapse-gui` installed. |

## `$CYNAPSE_HOME`

`$CYNAPSE_HOME` decides which store the CLI and `openStore()` use:
`$CYNAPSE_HOME/cynapse.db`, defaulting to `~/.cynapse/cynapse.db`. It is the only thing
that makes a runtime and its agents share one store.

**A runtime that launches agents must pass `$CYNAPSE_HOME` on to them.** If it does not,
the agents write to a different database from the runtime's, and neither sees the other's
entries (ADR-0013, item 7). `--db <path>` overrides it for a single command.

`$CYNAPSE_PARTICIPANT` names the acting participant when `--as` is not given.

## What counts as breaking

From the first release, each of these is a breaking change:

- Removing or renaming a `Store` method, an export or a type, or changing a signature so
  that existing calls or implementations stop compiling.
- Removing or renaming a field in a returned type or a `--json` shape, changing its type,
  or making an optional field required in an input.
- Removing or renaming a `cynapse.*` entry type, or removing or changing the meaning of a
  field in its `data`.
- Changing who may add or remove a reserved tag.
- Changing an exit code's value or meaning, or moving an existing failure to a different
  exit code or `code` string.
- Changing how `$CYNAPSE_HOME` resolves to a database path, or how the id of a
  participant or a subject's channel is derived, since those ids are written into every
  entry.
- Releasing a version that cannot open a database an earlier release wrote.

These are not breaking:

- Adding a `Store` method, an export, a type or a command.
- Adding an optional field to an input, or a field to a returned type or a `--json`
  shape. Readers must ignore fields they do not know.
- Adding a `cynapse.*` entry type or a field to an entry's `data`. Readers must skip
  types they do not know.
- Adding an error `code` for a failure that has none yet, on the exit code it already had.
- Changing human-readable text output and error messages. Branch on `--json` and on the
  `code`, never on prose.
