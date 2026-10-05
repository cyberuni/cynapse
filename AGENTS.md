# AGENTS.md

This file provides guidance to AI coding assistants when working with code in this repository.

## Skill Augmentations

When reading any `SKILL.md` file, always check whether a `SKILL.local.md` exists in the same directory. If it does, treat its contents as additional instructions that extend the base skill. Local augmentations take precedence over the base skill where they conflict.

## Commit Discipline

**Auto-commit rule:** When a unit of work is complete and verified, commit it immediately — do not wait for the user to ask. Batching multiple units into one commit, or finishing all work before committing, are both violations of this rule.

**Unit of work:** one coherent, independently revertable change — one domain's refactor, one feature, one bugfix, one test suite expansion for one concern, one config change. Never two unrelated concerns in the same commit. A TDD red-green-refactor cycle alone is not a commit boundary; commit when the full intended change is complete and tests pass. If the working tree has unrelated changes, leave them unstaged — commit the current unit first, then continue.

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- One concern per commit; never batch unrelated changes
- Stage only files for this unit: `git add <files>`, then verify with `git diff --cached`
- Never use `git add .`, `git add -A`, or `git add -p` (interactive commands agents cannot run)
- Never commit with red tests; run validation commands first

### References

- **`commit-work` skill** — staging, splitting, and message writing when committing
- `npx cyber-skills@<version> governance show skill-repo-structure` — discipline section format rules

## Development Workflow

Before writing any production code, invoke the `test-driven-development` skill. This applies whether coding starts from a user request or from your own initiative after plan approval.

## Design Discussion

Design here is worked out by argument, not by presenting a finished plan. Proposals get
challenged on specifics, and that is the process working.

- **Recommend, don't enumerate.** Open design questions get prose with a clear
  recommendation and its reasoning. A menu of options pushes the thinking back onto the
  reader; multiple-choice prompts are a poor fit for questions still being framed.
- **Concede the specific point, not the whole position.** When a step in your reasoning
  is shown to be wrong, say which step and why, and keep what still stands. Retracting
  wholesale to end a disagreement destroys the useful part of the proposal and hides
  which claim actually failed.
- **Defend what holds.** Agreement that isn't earned is worse than disagreement — if the
  objection doesn't land, say so and explain why.
- **Explain intent when asked, rather than withdrawing.** "Why did you propose that?"
  is a request for the reasoning, not a signal to drop it.
- **Say which frame you are in.** A decision about how the system is *set up* is not a
  decision about how it *runs*. Carrying momentum from one into the other produces
  designs that answer the wrong question — check the frame before generalising a
  solution into an architecture.
- **Mark what is load-bearing.** Separate decisions that are expensive to unwind from
  ones that can be revisited cheaply, and say which is which.
- **Test each rung of a ladder before proposing it.** A layered scheme is only worth
  proposing if each layer catches what you claim; verify rather than assume, since a
  layer that appears to help while laundering the defect is worse than no layer.

## System context

This repo is one package of [cyber-civitas](https://cyber-civitas.github.io), the system its sibling packages compose into. The [layer architecture](https://cyber-civitas.github.io/architecture/layers/) and the [cross-package decisions](https://cyber-civitas.github.io/decisions/) are recorded there; a decision inside this repo cites them rather than restating them.

- cynapse handles channels only. It does not spawn, nudge, or wake anything, and it never depends on the runtime; a channel records its members at most, and which runtime to ring is the runtime's business ([0001](https://cyber-civitas.github.io/decisions/0001-runtime-depends-on-communication/)).
- Coordination claims (advisory, TTL, path patterns) live here. Ownership leases and presence live in the runtime, because only it can observe liveness ([0002](https://cyber-civitas.github.io/decisions/0002-claims-and-leases/)).
- Project addressing lives here, including the derivation from the git common directory ([0004](https://cyber-civitas.github.io/decisions/0004-opaque-service-keys/)).

## What This Repo Is

`cynapse` — a persisted communication network for agents. It is the messaging layer —
the synapse between agents — extracted out of [cyberlegion](https://github.com/cyberuni/cyberlegion),
per [cyberuni/cyberlegion#20](https://github.com/cyberuni/cyberlegion/issues/20), so it
can be depended on as a peer rather than living inside just one unit.

It stores only what no other store can: ledgers of what happened, discussions between
agents (such as arbitration), coordination, leases and presence, and read state. Work
tracking stays in GitHub, Asana, Linear or beads, and agents use those directly; cynapse
tells them what to fetch and composes what they pass back, such as a change feed across
stores. It holds no credentials and never calls those services. cynapse refers to them by
reference shorthand (`gh:cyberuni/cynapse#12`). Channels are keyed by the subject they are
about: address channels for a repository, project or participant, and work channels for
an issue, PR, task or mission (ADR-0010 to ADR-0012).

Ships as an npm package:

- A CLI (`cynapse`) powered by Commander
- An agent plugin — the package root *is* the plugin root, so the tarball ships `plugin.json`, `skills/`, and the per-vendor manifests

### Settled decisions

- **cynapse owns participant addressing and identity** — addresses, standing/owner
  identity, and presence. Units — cyberlegion, and any future cyber-hive — register
  their participants with cynapse; cynapse does not register with them.
- **cyber-mux stays below cynapse.** It is pane mechanics, not messaging.

### Naming

| Surface | Name |
| --- | --- |
| Repo, npm package, plugin, skill prefix | `cynapse` |
| CLI bin | `cynapse` |

### Status

Prototype stage. The core model from
`.research/agent-messaging-architecture/conclusion.md` is built: channels of immutable
entries behind a `Store` interface (`src/store/types.ts`), with a stock-SQLite
implementation (`node:sqlite`, WAL, `seq` assigned under `BEGIN IMMEDIATE`, no daemon),
and CLI commands for channels, entries, read cursors, tags and state records.
ADR-0012 (channels keyed by subject: address and work channels, owners, alias keys) is
built. ADR-0013 (messaging between participants) is accepted and partly built: schema
migrations, followed threads, `excludeTags`/`excludeAuthors`, `entry wait` and the change
token (`cynapse changes`) and owner-only `cynapse.handled` are in; the participant
registry is not yet. ADR-0010 and ADR-0011 (subjects across stores, guide and compose) are
accepted but not built yet. `cynapse dev seed` builds an example world and
`cynapse dev load-test` checks `seq` under concurrent writer processes. Sync, the hub,
`init-cynapse`, and skills have not shipped yet.

### Plugin layout

Everything the plugin needs lives in `packages/cynapse/` and must stay listed in that
package's `files`, or it will not reach consumers.

| Path | Read by |
| --- | --- |
| `plugin.json` | [Agent Plugins 1.0.0](https://github.com/agentplugins/agent-plugins-spec) clients. Manifest schema is **closed** — components come from fixed locations, never inline fields |
| `.claude-plugin/plugin.json` | Claude Code |
| `.cursor-plugin/plugin.json` | Cursor |
| `.codex-plugin/plugin.json` | Codex |
| `.plugin/plugin.json` | Canonical universal-plugin source; not published |
| `skills/<name>/SKILL.md` | All of them (fixed location) |

When the first skill lands, create `packages/cynapse/skills/<name>/SKILL.md` and add
`"skills": "./skills/"` to `.plugin/plugin.json`, `.cursor-plugin/plugin.json`, and
`.codex-plugin/plugin.json`. `skills` is already in the package's `files` list.

`.claude-plugin/marketplace.json` at the **repo root** lists the plugin with an `npm`
source. Version bumps flow from `packages/cynapse/package.json` through
`scripts/sync-plugin-version.mjs` on `pnpm version` — add any new manifest to that
script's list.

## Commands

```
pnpm test                       # all package tests
pnpm cynapse test src/output.test.ts  # run one test file
pnpm verify                     # lint + build + typecheck + test + knip
pnpm build                      # compile to dist/
pnpm cynapse dev --help         # run the CLI from source (tsx)
pnpm web dev                    # run the docs site locally
pnpm seed [--reset]             # seed the example world into the database the GUI reads
pnpm gui dev                    # run the Council's viewer from source (see packages/cynapse-gui/README.md)
pnpm cynapse dev gui            # `cynapse gui` from source, on the built cynapse-gui (pnpm build first)
```

`pnpm cynapse <script>` is the root shortcut for `pnpm run --filter=./packages/cynapse <script>`.

## Layout

```
packages/cynapse/ the npm package and the plugin root
packages/cynapse-gui/ the Council's web viewer, started by `cynapse gui`
apps/web/         Astro + Starlight docs site, deployed to GitHub Pages
docs/adr/         architecture decision records (see docs/adr/README.md)
scripts/          repo maintenance scripts
```

## Key Conventions

### Agent-friendly output

The CLI follows the [10 agent-CLI principles](https://github.com/kunchenguid/axi#the-10-principles). Keep new commands consistent:

- **Structured output** goes through `src/output.ts` (`output(data, readable)`); `--json` is handled there — never branch on `process.argv` for format inside a command.
- **Empty states**: use `printEmpty(entity)` so an empty result names what was empty (`0 members found`), never a blank line.
- **Errors & exit codes**: throw `CynapseError` with an exit code; the top-level catch in `src/cli.ts` renders it via `renderCliError` / `exitCodeFor`. Never call `process.exit` inside a command. Commander usage errors (unknown flag or subcommand) exit `2`.
- **Store access**: commands open the store through `withStore` in
  `src/commands/context.ts` and act as `--as` / `$CYNAPSE_PARTICIPANT` via `actor()`.
  Every write goes through the `Store` interface, never raw SQL outside `src/store/`.
- **Metadata is written as entries**: any store method that changes channel metadata or
  state also appends a `cynapse.*` entry in the same transaction. Keep it that way.
- **The program is a function**: `createProgram()` in `src/program.ts` builds a fresh command tree so tests drive it without touching `process.argv`.

### Version

`src/version.ts` reads `package.json` at runtime rather than importing it, so the bundler never inlines a version that `pnpm version` later bumps. Both `dist/cli.js` and `src/cli.ts` sit one directory below the package root, so the same relative path serves built and source.
