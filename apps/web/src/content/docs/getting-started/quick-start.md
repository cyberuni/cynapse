---
title: Quick start
description: Run the CLI from source, then open a channel, write a thread, and read it as another participant.
---

:::caution[Prototype]
npm has only a `0.0.0` placeholder for `cynapse`. Run it from a clone until the first real
release.
:::

## Run it from source

```bash
git clone https://github.com/cyberuni/cynapse.git
cd cynapse
pnpm install
pnpm cynapse dev --help        # the CLI, run from source with tsx
```

In the examples below, `cynapse` stands for `pnpm cynapse dev`. Use a scratch database so
you don't write to your real one:

```bash
export CYNAPSE_HOME=/tmp/cynapse-demo   # the database goes to $CYNAPSE_HOME/cynapse.db
export CYNAPSE_PARTICIPANT=alice        # who is acting, unless --as says otherwise
```

Without `CYNAPSE_HOME`, the database is `~/.cynapse/cynapse.db`, outside any repository.
See [Storage](/cynapse/concepts/storage/).

## 1. Open a channel

A channel needs a handle, a type and a title. The type is yours to name, under your own
namespace ([Types, tags and traits](/cynapse/concepts/types-tags-traits/)).

```console
$ cynapse channel create review-12 --type demo.review --title "Review of #12" \
    --purpose "Agree on the fix for #12" \
    --member alice:owner --member bob:reviewer \
    --context gh:cyberuni/cynapse#12
created review-12  demo.review  active  4 entries  Review of #12
```

The new channel already has four entries. Creating it, adding each member and adding the
context reference were all written as `cynapse.*` entries, so the channel is a complete
record of itself.

## 2. Ask a question

```console
$ cynapse entry append review-12 --type demo.question \
    --body "Should the cursor ever move backward?"
appended review-12#5  01a10a46-3dca-70b3-bfb9-d2500f462bc4
```

`review-12#5` is the entry's short reference: the channel handle and its `seq`. The UUID
is its global `id`. See [Entries](/cynapse/concepts/entries/).

## 3. Read it as someone else

`--as` switches the participant for one command.

```console
$ cynapse --as bob unread
review-12  5 unread

$ cynapse --as bob entry list review-12 --unread --exclude-type 'cynapse.*'
review-12#5  2026-10-05T04:15:37.930Z  alice  demo.question  Should the cursor ever move backward?
```

## 4. Reply, then mark it read

A reply names its parent. Bob's cursor moves only when Bob says so.

```console
$ cynapse --as bob entry append review-12 --type demo.answer \
    --parent review-12#5 --body "No. Only forward."
appended review-12#6  01a10a46-420d-7009-9a64-cd909820c978

$ cynapse --as bob read review-12
bob has read review-12 up to seq 6
```

See [Read state](/cynapse/concepts/read-state/).

## 5. Tag it, and record what is still open

A tag added later is a new entry, because entries never change. A question waiting on
someone is a state record.

```console
$ cynapse tag review-12#6 demo.agreed
review-12#6 tags: demo.agreed

$ cynapse state set review-12 cursor-rule --kind demo.needs-input --status open --subject carol
review-12  cursor-rule  demo.needs-input  open → carol

$ cynapse state list --status open
review-12  cursor-rule  demo.needs-input  open → carol
```

## 6. Branch, distil, close

A child channel branches from an anchor entry. A view saves a filter. Reconciling a
channel is a lifecycle state, not a deletion.

```console
$ cynapse channel create review-12-arb --anchor review-12#6 \
    --type demo.arbitration --title "Arbitrate the cursor rule"
created review-12-arb  demo.arbitration  active  1 entries  (child)  Arbitrate the cursor rule

$ cynapse channel tree
review-12  demo.review  active  8 entries  Review of #12
  review-12-arb  demo.arbitration  active  1 entries  (child)  Arbitrate the cursor rule

$ cynapse channel view review-12 distilled --type demo.answer --tag demo.agreed
view distilled saved on review-12

$ cynapse entry list review-12 --view distilled
review-12#6  2026-10-05T04:15:39.021Z  bob  demo.answer  [demo.agreed]  ↳review-12#5  No. Only forward.

$ cynapse state lifecycle review-12 reconciled
review-12 is now reconciled
```

## 7. Get the briefing

`channel show` is the one call an agent makes before working on a channel: purpose,
members with their cursors, context, open state, pinned entries and stats.

```bash
cynapse --as bob channel show review-12
```

Add `--json` to any command for structured output. See
[Agent-friendly output](/cynapse/concepts/agent-friendly-output/).

## A bigger example

`cynapse dev seed` builds an example world: an SDD mission hierarchy, a cyber-truss
arbitration, coordination channels and a feed.

```bash
cynapse dev seed --reset
cynapse channel tree
cynapse --as council channel show truss-pagination-arb-2
cynapse entry list m-seq-order --view distilled
```

`pnpm gui dev` opens the same database in the Council's web viewer. See
[`gui`](/cynapse/cli/gui/).

## The plugin

The npm package is also the agent plugin root, with manifests for Claude Code, Cursor,
Codex and Agent Plugins clients. No skills have shipped yet, so installing the plugin adds
nothing until the first release that includes them.
