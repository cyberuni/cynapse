# cynapse

## 0.2.0

### Minor Changes

- 6f0fcec: Delete an entry or a channel (ADR-0014). `Store.deleteEntry` and `cynapse entry delete`
  erase one entry's content and leave a tombstone that keeps its `seq`, `parent` and `root`
  resolving, logged as `cynapse.entry.deleted`. `Store.deleteChannel` and
  `cynapse channel delete` do the same for every entry in a channel outside `cynapse.*` and move
  it to the reserved lifecycle state `deleted`, logged as `cynapse.channel.deleted`; any other
  lifecycle restores it. Anyone may delete, since no caller can be verified; the log records who
  did. `Entry` gains `deleted`, and `entries` and `listChannels` hide what was deleted unless
  `includeDeleted` (`--include-deleted`) is set.
- 6ac15b1: Every CLI error now suggests a next step: a `help:` line under the `error:` line in text, and a
  `help` field under `--json`. `CynapseError` takes a `help` option, and `helpFor` gives the next step
  for any thrown value. An unknown flag lists the flags the command accepts (`options` under `--json`),
  and a command group run without a subcommand, or with an unknown one, lists its subcommands
  (`subcommands`) on stdout instead of printing its usage to stderr.

### Patch Changes

- bb68d01: `channel create --member … --context …` now adds its members and context in the same transaction
  that creates the channel, so a failed create leaves nothing behind and can be retried.
  `CreateChannelInput` takes `members` and `context` to do the same from the library.
  
  `addParticipant` is deprecated in favour of `registerParticipant`. Until it goes, each change it
  makes is logged as `cynapse.participant.added` or `cynapse.participant.updated` in a new
  `cynapse.participants` channel. Callers will notice that channel in `channel list`, including in
  the seeded example world.
- 1c7a347: Deleting an entry or a channel now removes the erased content from disk, not only from reads. Every connection sets `PRAGMA secure_delete = ON`, so SQLite zeroes freed space instead of leaving old content in free pages, and `deleteEntry` and `deleteChannel` checkpoint and truncate the write-ahead log after they commit. The checkpoint is a best effort: it doesn't wait for a reader holding an older snapshot, and the delete succeeds either way. Content in `cynapse.*` entries, such as state values, titles and purposes, still can't be deleted.
- ace6650: Match a type prefix filter such as `sdd.*` literally and case-sensitively, like an exact
  type. It used SQL `LIKE`, so it ignored case and treated `_` and `%` as wildcards:
  `--type 'X.*'` listed `x.note`. The fix covers `entries`, `search`, views and
  `appendUnless`. A caller that relied on a case-insensitive prefix will now see fewer matches.
- 518cbf1: Opening a store no longer takes the write lock when its schema is current, so a read no longer waits behind a writer or fails with `database is locked`. Only an open that has migrations to run takes the lock.
- 4589877: A participant's own address channel now shows in its `cynapse unread`. The owner of an address channel is a member of it, with role `owner`: creating an address channel or registering a participant adds the owner, and `cynapse channel owner` makes the new owner a member with role `owner` and changes the old owner's role to `member`, each logged as `cynapse.member.joined`. A schema migration adds the owner as a member of every existing address channel, with its entry.
  
  Callers will notice: `unread` gains the owner's address channels, a channel's `members` lists its owner, and an address channel has one more entry after it is created.
- 080a78b: A database locked by another process past the busy timeout now fails with the error code `busy`
  ("retry"), and a full disk, an I/O error, or a damaged or non-database file fails with `storage`,
  whose help names the file and the integrity check to run. Both were reported as `failure` with
  help calling them a cynapse bug. The exit code stays `1`; callers that branched on `failure` for
  these now see the new codes.

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
