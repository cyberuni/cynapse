---
title: Getting Started
description: Install cynapse and run the CLI
---

:::caution
`cynapse` is at scaffold stage. The CLI shell, plugin manifests, and release pipeline
are in place; mail, channels, and DMs have not shipped yet.
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
cynapse --version
```

Every command accepts `--json` for structured output. See the
[CLI reference](/cynet/cli/).

## The plugin

The npm package *is* the plugin root, so installing it as a plugin gives an agent the
same surfaces the CLI exposes. Manifests ship for Claude Code, Cursor, Codex, and
Copilot CLI.

```bash
# Claude Code
/plugin marketplace add cyberuni/cynet
/plugin install cynapse
```
