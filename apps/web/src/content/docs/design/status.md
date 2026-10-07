---
title: Status
description: "What works today, what is accepted but not built, and what is still proposed, so no page promises an unbuilt feature as working."
---

cynapse is a prototype. The core model works on one machine and is released as `0.1.0`;
most of the network around it is designed and not yet built. Status as of October 2026.

| Word | Meaning |
| --- | --- |
| **Built** | The code is on `main`. It is in the `0.1.0` release unless the row says "added after 0.1.0". |
| **Accepted, not built** | The decision is recorded in an accepted ADR. The code doesn't exist. |
| **Proposed** | An open issue or proposed ADR describes it, and it may still change. |

## The core model

| Part | Status | Page |
| --- | --- | --- |
| Channels: UUID identity, renameable handles, aliases, anchors and child channels | Built | [Channels](/cynapse/concepts/channels/) |
| Entries: UUIDv7 `id`, gap-free `seq`, idempotent append | Built | [Entries](/cynapse/concepts/entries/) |
| Threads: `parent` and `root` | Built | [Entries](/cynapse/concepts/entries/#threads) |
| Read cursors and `unread` | Built | [Read state](/cynapse/concepts/read-state/) |
| Namespaced types and tags, tags added later as entries | Built | [Types, tags and traits](/cynapse/concepts/types-tags-traits/) |
| Traits | Recorded, not acted on | [Traits](/cynapse/concepts/types-tags-traits/#traits) |
| State records and lifecycle | Built | [State and lifecycle](/cynapse/concepts/state-and-lifecycle/) |
| Views (saved filters) | Built | [Views](/cynapse/concepts/views/) |
| The briefing, `channel show` | Built | [Channels](/cynapse/concepts/channels/#the-briefing) |
| Conditional append (a "happens at most once" write), `appendUnless` | Built, in the library only | [Store](/cynapse/api/store/#appendunlessref-input-unless) |
| Deleting an entry or a channel, with tombstones | Built (ADR-0014), added after 0.1.0 | [Entries](/cynapse/concepts/entries/#deleting-an-entry) |
| Editing an entry | Proposed ([#62](https://github.com/cyberuni/cynapse/issues/62)) | [Entries](/cynapse/concepts/entries/#immutability) |
| Leases | Accepted, not built | [State and lifecycle](/cynapse/concepts/state-and-lifecycle/#leases-planned) |
| Distilled view as the default once reconciled; retention | Accepted, not built | [State and lifecycle](/cynapse/concepts/state-and-lifecycle/#cleanup-is-a-state-not-a-deletion) |

## Storage and tooling

| Part | Status | Page |
| --- | --- | --- |
| Stock SQLite, WAL, `seq` under `BEGIN IMMEDIATE`, no daemon | Built; load-tested with 32 writers | [Storage](/cynapse/concepts/storage/) |
| Schema version and forward migrations | Built | [Storage](/cynapse/concepts/storage/#schema-version-and-migrations) |
| The CLI with `--json`, stable error codes and exit codes | Built | [CLI](/cynapse/cli/) |
| A next step (`help`) on every CLI error | Built, added after 0.1.0 | [CLI](/cynapse/cli/#errors) |
| The library: `openStore` and the `Store` interface | Built; a public contract since 0.1.0 | [Library API](/cynapse/api/) |
| `cynapse dev seed`, `dev load-test`, `cynapse gui` | Built | [`dev`](/cynapse/cli/dev/), [`gui`](/cynapse/cli/gui/) |
| The hub, multi-machine sync, offline writers | Accepted, not built; technology not chosen | [Storage](/cynapse/concepts/storage/#beyond-one-machine-planned) |
| Agent plugin skills | Not shipped | [Install](/cynapse/getting-started/install/#optional-extras) |

## Messaging and subjects

| Part | Status | Page |
| --- | --- | --- |
| Work and address channels keyed by subject: kinds, owners, alias keys, `registerAddress` | Built (ADR-0012). A free-string `--key` still works | [Subjects and channel kinds](/cynapse/concepts/subjects/) |
| Participant registry, `resolveAddress`, retirement | Built (ADR-0013). Any `--as` value still creates a participant on first use | [Participants](/cynapse/concepts/participants/#registration) |
| Messaging reads: followed threads in `unread`, `excludeTags` and `excludeAuthors`, `entry wait` | Built (ADR-0013) | [Messaging](/cynapse/concepts/messaging/) |
| The change token, `changes` | Built (ADR-0013) | [Messaging](/cynapse/concepts/messaging/#knowing-that-something-arrived) |
| Owner-only `cynapse.handled` on address channels | Built (ADR-0013) | [Messaging](/cynapse/concepts/messaging/#seen-versus-handled) |
| The boundary with a runtime | Accepted (ADR-0013). It says what stays with the runtime, so cynapse has nothing to build for it | [cynapse and the runtime](/cynapse/design/runtime/) |
| Reference shorthand such as `gh:cyberuni/cynapse#12` | Built as free-form text rendered as a link | [Refs](/cynapse/api/refs/) |
| Subjects and relations across stores | Accepted, not built (ADR-0010) | [What cynapse stores](/cynapse/design/scope/#a-network-of-subjects) |
| Guide and compose; write-back; `cynapse.published` | Accepted, not built (ADR-0011) | [What cynapse stores](/cynapse/design/scope/#guide-and-compose) |
| Routing kinds, prefixed conventions, `init-cynapse`, stamps | Accepted, not built (ADR-0008) | [Decisions](/cynapse/design/decisions/) |
