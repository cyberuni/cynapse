---
title: Install
description: "Install the cynapse CLI or library, choose where the database lives, and set who you act as."
---

cynapse ships as one npm package, `cynapse`, which holds both the `cynapse` command and the
library. The latest release is `0.1.0`.

## Requirements

- **Node.js 22.13 or later.** cynapse uses Node's built-in `node:sqlite`, so there is no
  native module to build and no database server to run.
- A local filesystem for the database. Every process that shares a store runs on the same
  machine ([Guarantees](/cynapse/concepts/guarantees/#concurrency)).

## Install the CLI

```bash
npm install -g cynapse
cynapse --version
```

```text
0.1.0
```

To try it without installing, run `npx cynapse --version`.

## Install the library

```bash
npm install cynapse
```

The package is ESM only and ships its own types. Import from `cynapse`:

```js
import { openStore } from 'cynapse'
```

On Node 22, loading `node:sqlite` prints an experimental warning on stderr. The CLI hides
it. A library user can hide it too ([Library API](/cynapse/api/)).

## Choose where the data goes

The store is one SQLite file:

```text
$CYNAPSE_HOME/cynapse.db        # CYNAPSE_HOME defaults to ~/.cynapse
```

- `--db <path>` picks another file for one command.
- `openStore({ path })` picks it in the library.
- **Every process that should talk to each other needs the same `CYNAPSE_HOME`.** A runtime
  that launches agents passes it on to them.

To experiment without touching your real store, point `CYNAPSE_HOME` at a scratch directory:

```bash
export CYNAPSE_HOME="$(mktemp -d)"
```

## Choose who you act as

Every write names the participant who made it. Give it with `--as <participant>` on each
command, or once with `CYNAPSE_PARTICIPANT`:

```bash
export CYNAPSE_PARTICIPANT=alice
```

`--as` takes a participant's id. A name the store hasn't seen becomes a new participant on
first use. Registered participants have UUID ids; [Use the CLI](/cynapse/guides/cli/) shows
how to look one up. Examples on this site that leave out `--as` assume
`CYNAPSE_PARTICIPANT` is set.

## Run from source

To run the code on `main`:

```bash
git clone https://github.com/cyberuni/cynapse.git
cd cynapse
pnpm install
pnpm cynapse dev --help        # the CLI, run from source
```

This site documents `main`. A feature marked "added after 0.1.0" works from source and
reaches npm with the next release.

## Optional extras

- **The viewer.** `cynapse gui` opens a read-and-triage web viewer on the same database. It
  needs `@cyberuni/cynapse-gui` installed next to cynapse ([`gui`](/cynapse/cli/gui/)).
- **The agent plugin.** The package is also an agent plugin for Claude Code, Cursor, Codex
  and Agent Plugins clients. It ships no skills yet, so installing it as a plugin adds
  nothing today.

## Next

- [Quick start](/cynapse/getting-started/quick-start/): two participants, one
  conversation.
