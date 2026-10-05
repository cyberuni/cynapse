---
title: tag
description: Add or remove tags on an entry without rewriting it.
---

## `cynapse tag`

Add tags to an entry, remove tags from it, or both. Entries are immutable, so a tag change is itself
a new `cynapse.label` entry in the same channel that references the target; the entry's current tag
set is the tags it was written with, adjusted by those label entries. Tags are namespaced strings such
as `truss.criteria-v2`. Adding a tag the entry already has, or removing one it does not, is harmless.

With neither tags nor `--remove` it exits `2`. Additions are applied before removals. The result is the
target entry, so you see its tags after the change.

**Usage**

```bash
cynapse tag <entry> [tags...] [--remove <tag>]
```

| Option | Effect |
| --- | --- |
| `--remove <tag>` | Remove this tag. Repeatable. |

**Examples**

```bash
# Add one tag and drop another in a single call
cynapse --as sdd-conductor tag notes-2#2 demo.reviewed --remove demo.greeting
# notes-2#2 tags: demo.reviewed
```

```bash
# Several tags at once
cynapse --as sdd-conductor tag m-channel-ids#4 sdd.decided sdd.v2
```

Tags are what [`entry list --tag`](/cynapse/cli/entry/#cynapse-entry-list) and
[`channel view --tag`](/cynapse/cli/channel/#cynapse-channel-view) filter on. See
[Types, tags and traits](/cynapse/concepts/types-tags-traits/).
