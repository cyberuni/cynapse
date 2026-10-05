# cynapse

## 0.1.0

### Minor Changes

- 33717b2: Add `Store.appendUnless`, which appends an entry only if no entry in the channel matches a condition,
  checked in the same write transaction that assigns `seq`. The GUI rules on a decision with it, so two
  rulings submitted at once can no longer both land.
- f368905: Add `Store.changes(since?)` and `cynapse changes [--since <token>]`, a store-wide change token a
  runtime can poll cheaply. It returns an opaque token and the channels whose `lastSeq` moved after
  the given token, or every channel without one. Every append bumps it, metadata entries included.
  A token from another store fails with `foreign_token`. The schema gains a migration that backfills
  existing databases. `ChannelTraits.wake` is documented as advice to the runtime: cynapse never wakes anyone.
- bddf82e: Add `channelKey` and `channelIdOf`, which build a subject's channel key from its store and
  native ID (`subject:<store>:<nativeId>`, such as `subject:gh:R_kgDOPfmJ6A`) and derive the
  channel's UUIDv5 from it. Two runtimes that resolve the same native ID derive the same channel.
- 1d9cd3c: Channels now have a kind (ADR-0012). An address channel is keyed by a subject that can receive
  messages and has an `owner`; a work channel has members and no owner. `createChannel` takes a
  `subject` (`{ store, nativeId }`) and derives the channel id from it, so a second consumer that
  opens the same subject gets the same channel whatever type it perceives. `addSubject` adds an alias
  key when a subject moves, `getChannelBySubject` resolves any of a channel's keys, `setOwner`
  changes an address channel's owner and logs `cynapse.channel.owner-changed`, and `registerAddress`
  mints a `cynapse` subject for an address with no native ID, such as a folder. `Channel` gains
  `kind`, `owner` and `subjects`, handles may contain `:`, and schema migration 3 makes every
  existing channel a work channel.
- 4d561a5: `cynapse channel create` takes `--store` and `--native-id` to key a channel by its subject, and
  `--kind address --owner <participant>` for an address channel; an address without `--store` gets a
  minted key. New verbs: `channel resolve --store --native-id` finds a channel by any of its keys,
  `channel add-key` adds an alias key after a move, and `channel owner` changes an address channel's
  owner. `channel list --kind` filters by kind, and `channel show` names the owner and keys.
- e5f3c3c: Add `cynapse gui`, which opens the Council's web viewer on the current database. The viewer
  ships separately as `@cyberuni/cynapse-gui`; install it next to cynapse to use the command.
- dd9f0cb: Add `cynapse entry wait <entry> --timeout <seconds>`, which polls the entry's thread in-process
  and prints the first reply from someone other than you. With no reply in time it fails with code
  `timeout` and the new exit code `3`, exported as `EXIT_TIMEOUT`.
- 973eb91: Add `excludeTags` and `excludeAuthors` to `ViewFilter`, so `entries()`, `search()`, saved views and
  `appendUnless` can leave out entries that carry a tag now or that someone wrote. `entry list` and
  `channel view` take them as `--exclude-tag` and `--exclude-author`; `--exclude-tag cynapse.handled`
  lists what is still unhandled.
- fe7403c: `unread` now also counts replies in threads you follow. You follow every thread you wrote an entry
  in, so a question asked on a channel you are not a member of, such as someone else's address
  channel, brings its answer into your `unread`. A reply counts when it comes after both your cursor
  on that channel and your own last entry in that thread; `cynapse read` clears it. Following is
  derived from the entries, with no new table.
- 3bc8e38: `cynapse.handled` is now a reserved tag: only the owner of an address channel may add or remove it,
  through `addTags`/`removeTags`, `cynapse tag` or at append time. Anyone else fails with the `not_owner`
  error code, and the tag on a work channel fails with `not_address`; neither writes a `cynapse.label`
  entry. The tag name is exported as `HANDLED_TAG`.
- fa5c956: Print errors on stdout, as axi asks: `error: <message>` in text and `{ "error": { "code", "message" } }` under `--json`, including usage errors. A missing channel, entry or view is now coded `not_found`.
- 5293ef3: Add `cynapse participant register|retire|rename|resolve|list`, and `cynapse entry send <name>`, which
  appends to the addressee's address channel after resolving the exact name among live participants.
  Sending never creates a participant: an unknown name exits `5` (`unknown_address`) and an ambiguous
  one exits `4` (`ambiguous_address`), with every candidate in `error.candidates` under `--json`.
- 33d6b9c: Participants are registered (ADR-0013, needs 1 and 8). `registerParticipant({ key, kind, name, registeredBy })`
  derives the id as `UUIDv5(key)`, creates the participant's address channel (keyed by `cynapse` and
  its id, owned by it, handle from its name) and logs `cynapse.participant.registered` there. Registering
  a live key again is a no-op, the same key with another kind fails with `id_conflict`, and a unit
  registers itself as a `service`. `retireParticipant` and `renameParticipant` log
  `cynapse.participant.retired` and `cynapse.participant.renamed`, and a retired participant is revived
  by registering its key again. `resolveAddress(name, { kinds })` matches a live participant's id, name,
  or address handle or alias exactly: more than one match fails with `ambiguous_address` (exit `4`),
  listing every candidate in `details.candidates`, and none fails with `unknown_address` (exit `5`).
  `participants({ status, registeredBy })` lists them for reconciliation. `Participant` gains `status`,
  `key` and `registeredBy`; `CynapseError` gains `details`, rendered beside `code` under `--json`; schema
  migration 4 makes every existing participant live with no key.
- d86cdf3: Declare the public contract. From this first `0.x` release, the `Store` interface and the package's exports, the CLI's `--json` shapes, the `cynapse.*` entry types and the reserved `cynapse.handled` tag, the error and exit codes, and `$CYNAPSE_HOME` as the shared-store location are the contract a runtime builds on. Changing any of them is a breaking change, released as a new minor version while cynapse is `0.x`. See [Public contract](https://cyberuni.github.io/cynapse/public-contract/).
- ad30ecf: Update runtime dependencies.

### Patch Changes

- 84cfb55: A command group run without a subcommand, such as `cynapse channel`, now prints its usage
  to stderr and exits `2` instead of printing nothing and exiting `0`.
- eb729d7: Opening a fresh database from several processes at once no longer fails with `database is locked`.
  SQLite refuses the losing processes' switch to WAL mode immediately instead of waiting out
  `busy_timeout`, so the store now retries that switch within the same timeout.
- acbbfba: Version the database schema. The store records its schema version in `PRAGMA user_version` and runs any pending forward migrations in one transaction when it opens, so existing databases upgrade in place. A database newer than the installed cynapse is refused with the `schema_too_new` error instead of being written to.
- 448e3a7: `cynapse dev seed --reset` now requires an explicit `--db`. Without one it exits with a usage error instead of deleting the default `$CYNAPSE_HOME/cynapse.db`.
- 6ac5b3f: `cynapse state list --status` now rejects a value other than `open` or `resolved` with exit 2, as `state set` does, instead of returning an empty list.
