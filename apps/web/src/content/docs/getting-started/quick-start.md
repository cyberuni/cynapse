---
title: Getting Started
description: Install cynapse and run the CLI
---

:::caution
`cynapse` is at prototype stage. The local store and CLI work; multi-machine sync has
not shipped yet.
:::

## Installation

```bash
npm install -g cynapse
```

Or run it without installing:

```bash
npx cynapse --version
```

## The CLI

The binary is `cynapse`.

```bash
cynapse --help
cynapse --db /tmp/world.db dev seed --reset   # build an example world
cynapse --db /tmp/world.db channel tree
cynapse --db /tmp/world.db --as council channel show truss-pagination-arb-2
cynapse --db /tmp/world.db entry list m-seq-order --view distilled
```

The store defaults to `$CYNAPSE_HOME/cynapse.db` (home `~/.cynapse`). Writes need a
participant: `--as <participant>` or `$CYNAPSE_PARTICIPANT`.

Every command accepts `--json` for structured output. See the
[CLI reference](/cynapse/cli/).

## The plugin

The npm package *is* the plugin root, so installing it as a plugin gives an agent the
same surfaces the CLI exposes. Manifests ship for Claude Code, Cursor, Codex, and
Copilot CLI.

```bash
# Claude Code
/plugin marketplace add cyberuni/cynapse
/plugin install cynapse
```
