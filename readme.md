# cynapse

A persisted communication network for agents.

> **Prototype stage.** This is the messaging layer (the synapse between agents)
> extracted out of [cyberlegion](https://github.com/cyberuni/cyberlegion), per
> [cyberuni/cyberlegion#20](https://github.com/cyberuni/cyberlegion/issues/20). The
> local store and CLI work; multi-machine sync has not shipped.

## What it is

cynapse owns the communication that has no home elsewhere: ledgers of what happened,
discussions between agents (such as arbitration), coordination, change feeds, leases and
presence, and read state. Work tracking stays in GitHub, Asana, Linear or beads;
cynapse refers to it by reference shorthand (`gh:cyberuni/cynapse#12`). DMs, mission
ledgers and arbitrations are all channels with a consumer-defined type.

cynapse owns participant addressing and identity. Units — cyberlegion, and any future
cyber-hive — register with cynapse, not the other way round.

## Installation

```sh
npm install -g cynapse
```

Or without installing:

```sh
npx cynapse --version
```

## The model

A **channel** is an ordered, append-only sequence of immutable **entries**. Each entry has
a writer-minted UUIDv7 id (its idempotency key) and a per-channel `seq` in arrival order,
so `handle#seq` is its short reference. Child channels branch from an anchor entry in a
parent. Types and tags are namespaced and defined by consumers (`sdd.mission`,
`truss.arbitration`). Metadata changes, tag changes and state transitions are all
entries too. The store is stock SQLite at `$CYNAPSE_HOME/cynapse.db` (default
`~/.cynapse`), or `--db <path>`.

## CLI

```sh
cynapse --json <command>          # structured output on every command
cynapse --as alice channel create auth --type sdd.mission --title "Add auth" \
  --member bob:reviewer --context gh:cyberuni/cynapse#12
cynapse --as bob channel show auth  # the briefing: purpose, members, context, state, pinned, stats
cynapse --as alice entry append auth --type sdd.decision --body "Use JWT" --ref gh:cyberuni/cynapse#12
cynapse --as bob entry list auth --unread --meta-only
cynapse entry show auth#2
cynapse --as bob read auth         # advance the read cursor
cynapse --as bob tag auth#2 sdd.risk
cynapse --as bob state set auth handle-namespace --kind needs-input --status open --subject council
cynapse --as bob state lifecycle auth reconciled
cynapse channel tree
cynapse --db /tmp/world.db dev seed --reset   # an example world to explore
cynapse dev load-test --writers 12            # concurrent writers; checks seq and integrity
```

| Exit code | Meaning |
| --- | --- |
| `0` | Success, including `--help` and `--version` |
| `1` | The command ran and failed |
| `2` | Usage error: unknown flag or subcommand, bad option value, or no `--as` for a write |

## Plugin

The npm package *is* the plugin root. Manifests ship for Claude Code, Cursor, Codex, and
Copilot CLI.

```sh
# Claude Code
/plugin marketplace add cyberuni/cynapse
/plugin install cynapse
```

## Documentation

<https://cyberuni.github.io/cynapse>

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). AI coding assistants should read
[AGENTS.md](AGENTS.md).

## License

[MIT](license)
