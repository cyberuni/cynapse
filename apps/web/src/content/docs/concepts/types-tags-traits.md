---
title: Types, tags and traits
description: Consumer-defined, namespaced types for channels and entries; tags for filtering; the few generic traits cynapse defines.
---

cynapse doesn't know what a mission, an arbitration or a gate verdict is. Its consumers do.
So channel types and entry types are **namespaced and defined by consumers**, and cynapse
defines only generic traits.

## Namespaces

| Namespace | Owner | Examples |
| --- | --- | --- |
| `cynapse.*` | cynapse, for its own metadata entries | `cynapse.channel.created`, `cynapse.member.joined`, `cynapse.label`, `cynapse.summary` |
| `sdd.*` | SDD | `sdd.mission`, `sdd.gate`, `sdd.decision` |
| `truss.*` | cyber-truss | `truss.arbitration`, `truss.answer.agree`, `truss.consensus` |
| your own | you | `demo.review`, `x.incident` |

Don't write `cynapse.*` types yourself, apart from the ones the docs tell you to, such as
`cynapse.summary`. Pick a namespace that won't collide with another consumer's.

Filters accept an exact type or a namespace prefix ending in `.*`:

```bash
cynapse entry list m-seq-order --type 'sdd.*' --exclude-type 'sdd.leash'
```

## Type versus tag

| | Type | Tags |
| --- | --- | --- |
| How many | Exactly one per entry | Any number |
| Job | Decides how `data` is read | Filtering and grouping |
| Changes later? | Never | Yes, through `cynapse.label` entries |

A tag can be given when the entry is written (`entry append --tag`) or later:

```bash
cynapse tag review-12#6 demo.agreed
cynapse tag review-12#6 --remove demo.agreed
```

A later tag doesn't modify the entry. It appends a `cynapse.label` entry, and the entry's
current tags are folded from its write-time tags and every label entry since. So who
tagged what, and when, stays in the channel.

**A decision is its own entry type,** written on purpose, such as `sdd.decision`. It isn't
inferred from a run of state changes.

## Traits

A channel's type is the consumer's. The **traits** are cynapse's, and the consumer picks
them for its type:

| Trait | Values | Status |
| --- | --- | --- |
| `membership` | `open` (default) or `fixed` | Recorded, not enforced ([Participants](/cynapse/concepts/participants/#how-a-participant-gets-into-a-channel)) |
| `wake` | `false` (default) or `true` | Recorded, read by nothing. Planned as advice to the runtime that launches agents, never something cynapse acts on. |
| `retention` | a retention class | Set through the library only; recorded, not acted on |
| `defaultView` | a view name | Set through the library only; recorded, not applied yet |

```bash
cynapse channel create coord-x --type coord.channel --title "x agents" --membership open --wake
```

## Related

- CLI: [`tag`](/cynapse/cli/tag/), [`entry list`](/cynapse/cli/entry/)
- Decision: [ADR-0005](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0005-consumer-defined-types-tags-and-traits.md)
