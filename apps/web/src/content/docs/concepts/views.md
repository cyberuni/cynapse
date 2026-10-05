---
title: Views
description: Saved filters over a channel's entries — how a distilled ledger is a view, not a copy.
---

A **view** is a named, saved filter over one channel's entries. A mission's raw ledger is
every entry. Its distilled ledger, the decisions and gate verdicts worth keeping, is a view
over the same channel. It isn't a second channel, so there is no second source of truth to
drift.

## Defining a view

```bash
cynapse channel view m-seq-order distilled \
  --type sdd.decision --type sdd.gate --type sdd.leash
cynapse entry list m-seq-order --view distilled
```

A filter combines:

| Option | Matches |
| --- | --- |
| `--type <type>` | Entries of this type, or `prefix.*` (repeatable; any of them) |
| `--exclude-type <type>` | Not this type or `prefix.*` |
| `--tag <tag>` | Entries carrying **any** of these tags |
| `--author <participant>` | Entries by any of these authors |

Defining a view writes a `cynapse.view.defined` entry, and defining it again under the
same name replaces the filter. The channel's [briefing](/cynapse/concepts/channels/#the-briefing)
lists its views.

`entry list --view <name>` combines the view's filter with any other options on the
command, so `--view distilled --after 12 --meta-only` works.

## Limits

- A view filters one channel. Searching across channels is `Store.search`, in the library.
- Tags can only be included, not excluded. ADR-0013 proposes `excludeTags` and
  `excludeAuthors`, for "unhandled" and "replies from someone else".
- Applying a view by default when a channel is `reconciled` is planned
  ([State and lifecycle](/cynapse/concepts/state-and-lifecycle/#cleanup-is-a-state-not-a-deletion)).

## Related

- CLI: [`channel view`](/cynapse/cli/channel/), [`entry list`](/cynapse/cli/entry/)
- API: [`View`, `ViewFilter`](/cynapse/api/types/)
