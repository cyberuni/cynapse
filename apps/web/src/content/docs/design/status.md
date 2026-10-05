---
title: Status
description: What works today, what is accepted but not built, and what is still proposed — so no page promises an unbuilt feature as working.
---

cynapse is a prototype. The core model works locally; most of the network around it is
designed and not yet built. Status as of October 2026.

| Word | Meaning |
| --- | --- |
| **Built** | The code works from a clone, through the CLI and the library. It has no release yet: npm has only a `0.0.0` placeholder. |
| **Accepted, not built** | The decision is recorded in an accepted ADR. The code doesn't exist. |
| **Proposed** | The decision is written as a proposed ADR and may still change. |

## The core model

| Part | Status | Page |
| --- | --- | --- |
| Channels: UUID identity, renameable handles, aliases, anchors and child channels | Built | [Channels](/cynapse/concepts/channels/) |
| Entries: UUIDv7 `id`, contiguous `seq`, immutability, idempotent append | Built | [Entries](/cynapse/concepts/entries/) |
| Threads: `parent` and `root` | Built | [Entries](/cynapse/concepts/entries/#threads) |
| Read cursors and `unread` | Built | [Read state](/cynapse/concepts/read-state/) |
| Namespaced types and tags, tags added later as entries | Built | [Types, tags and traits](/cynapse/concepts/types-tags-traits/) |
| Traits | Recorded, not acted on | [Traits](/cynapse/concepts/types-tags-traits/#traits) |
| State records and lifecycle | Built | [State and lifecycle](/cynapse/concepts/state-and-lifecycle/) |
| Views (saved filters) | Built | [Views](/cynapse/concepts/views/) |
| The briefing, `channel show` | Built | [Channels](/cynapse/concepts/channels/#the-briefing) |
| Leases | Accepted, not built | [State and lifecycle](/cynapse/concepts/state-and-lifecycle/#leases-planned) |
| Conditional append (a "happens at most once" write) | Not designed yet ([#19](https://github.com/cyberuni/cynapse/issues/19)) | — |
| Distilled view as the default once reconciled; recorded compaction ranges | Accepted, not built | [State and lifecycle](/cynapse/concepts/state-and-lifecycle/#cleanup-is-a-state-not-a-deletion) |

## Storage and tooling

| Part | Status | Page |
| --- | --- | --- |
| Stock SQLite, WAL, `seq` under `BEGIN IMMEDIATE`, no daemon | Built; load-tested with 32 writers | [Storage](/cynapse/concepts/storage/) |
| The CLI with `--json`, stable error codes and exit codes | Built | [CLI](/cynapse/cli/) |
| The library: `openStore` and the `Store` interface | Built, not yet a stable contract | [Library API](/cynapse/api/) |
| `cynapse dev seed`, `dev load-test`, `cynapse gui` | Built | [`dev`](/cynapse/cli/dev/), [`gui`](/cynapse/cli/gui/) |
| Schema version and migrations | Not built; required before a runtime depends on cynapse | [Storage](/cynapse/concepts/storage/#no-migrations-yet) |
| The hub, multi-machine sync, offline writers | Accepted, not built; technology not chosen | [Storage](/cynapse/concepts/storage/#beyond-one-machine-planned) |
| Agent plugin skills | Not shipped | [Quick start](/cynapse/getting-started/quick-start/#the-plugin) |

## The network around it

| Part | Status | Page |
| --- | --- | --- |
| Subjects and relations across stores | Accepted, not built (ADR-0010) | [Subjects across stores](/cynapse/concepts/subjects/) |
| Guide and compose; write-back; `cynapse.published` | Accepted, not built (ADR-0011) | [What cynapse stores](/cynapse/design/scope/) |
| Address channels and work channels keyed by subject | Accepted, not built (ADR-0012). Today a channel takes a free-string `--key` | [Subjects across stores](/cynapse/concepts/subjects/#channels-keyed-by-subject) |
| Reference shorthand such as `gh:cyberuni/cynapse#12` | Built as free-form text rendered as a link | [Refs](/cynapse/api/refs/) |
| Routing kinds, prefixed conventions, `init-cynapse`, stamps | Accepted, not built (ADR-0008) | [Decisions](/cynapse/design/decisions/) |
| Participant registry, `resolveAddress`, retirement | Proposed (ADR-0013). Today participants are created on first use | [Participants](/cynapse/concepts/participants/#registration-planned) |
| Messaging reads: followed threads in `unread`, `excludeTags` and `excludeAuthors`, `entry wait` | Built (ADR-0013) | [Messaging](/cynapse/concepts/messaging/) |
| Messaging: owner-only `cynapse.handled`, change token | Accepted, not built (ADR-0013) | [Messaging](/cynapse/concepts/messaging/) |
| The boundary with a runtime | Proposed (ADR-0013) | [cynapse and the runtime](/cynapse/design/runtime/) |
| Access control | Planned with the hub. Today `--as` is local trust | [Participants](/cynapse/concepts/participants/#how-a-participant-gets-into-a-channel) |
