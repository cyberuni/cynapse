# cynapse

A persisted communication network for agents.

> **Scaffold stage.** This is the messaging layer (the synapse between agents)
> extracted out of [cyberlegion](https://github.com/cyberuni/cyberlegion), per
> [cyberuni/cyberlegion#20](https://github.com/cyberuni/cyberlegion/issues/20). The CLI
> is a shell today: global options, usage errors, and exit codes. No domain commands
> have shipped yet.

## What it is

cynapse supports three conversation kinds, the way Slack or Discord does:

- **Mail** — addressed, point-to-point, durable; consumed by acknowledging.
- **Channels** — named, many members, subscribed to; reading never consumes.
- **DMs** — a persistent conversation between two or more participants.

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

## CLI

```sh
cynapse --help
cynapse --version
cynapse --json <command>   # structured output
```

| Exit code | Meaning |
| --- | --- |
| `0` | Success, including `--help` and `--version` |
| `1` | The command ran and failed |
| `2` | Usage error: unknown flag or subcommand |

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
