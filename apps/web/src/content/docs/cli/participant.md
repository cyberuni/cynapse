---
title: participant
description: Register, retire, rename and resolve participants, and list them for reconciliation.
---

A [participant](/cynapse/concepts/participants/) registered by a unit has an id derived from a key, a
status (`live` or `retired`), and an **address channel** keyed by its id and owned by it. Every
registration, retirement and rename is an entry in that channel, so the participant's history reads
like any other channel's ([ADR-0013](https://github.com/cyberuni/cynapse/blob/main/docs/adr/0013-messaging-between-participants.md)).

`<participant>` arguments take a participant id.

## `cynapse participant register`

Register a participant under a key namespaced by the registering unit, such as
`cyberlegion:role/reviewer`. The id is `UUIDv5(key)`. One transaction creates the participant, creates
its address channel (handle made from `--name`, with the start of the id appended if that handle is
taken), and writes `cynapse.participant.registered` there.

- Registering a live key again is a no-op and writes nothing.
- Registering a retired key revives it, in the same address channel, keeping its name. Rename it
  separately.
- The same key with a different `--kind` fails with `id_conflict`.

The registering unit is a participant of kind `service`. It registers itself with `--self`, and then
registers its participants acting as itself (`--as <its id>`); a registrant that isn't a `service`
fails.

**Usage**

```bash
cynapse participant register <key> --kind <kind> --name <name> [--self]
```

| Option | Effect |
| --- | --- |
| `--kind <kind>` | Required. `agent`, `human` or `service`. Anything else exits `2`. |
| `--name <name>` | Required. The name it resolves by. Not unique. |
| `--self` | A unit registering itself, which must be a `service`. Without it, the registrant is `--as`. |

**Examples**

```bash
cynapse participant register cyberlegion:unit/37757199c374e73a --kind service --name cyberlegion --self
cynapse --as 5f1c… participant register cyberlegion:role/reviewer --kind agent --name reviewer
# registered 8d0e…  agent  reviewer  live  registered by 5f1c…  address reviewer
```

## `cynapse participant retire`

Mark a participant `retired` and write `cynapse.participant.retired` in its address channel. It stops
resolving; its address channel stays readable, and it is never deleted, because entries name it as
their author. Retiring a retired participant is a no-op. A participant from before the registry has no
address channel and can't be retired.

```bash
cynapse --as <unit> participant retire <participant>
```

## `cynapse participant rename`

Rename a participant and its address channel's handle, writing `cynapse.channel.renamed` and
`cynapse.participant.renamed`. The old handle stays as an alias, so it still resolves.

```bash
cynapse --as <unit> participant rename <participant> <name>
```

## `cynapse participant resolve`

The one live participant whose id, name, or address channel's handle or alias is exactly `<name>`,
with its address channel. The match is exact: no prefixes, no case folding. It never picks among
several matches.

| Outcome | Code | Exit |
| --- | --- | --- |
| One match | | `0` |
| More than one | `ambiguous_address` | `4` |
| None | `unknown_address` | `5` |

An ambiguous name lists every candidate, in the text message and as `error.candidates` under `--json`.
Address one by its id instead.

```json
{
  "error": {
    "code": "ambiguous_address",
    "message": "\"reviewer\" names 2 live participants; address one by its id: …",
    "candidates": [
      { "id": "1b6f…", "kind": "agent", "name": "reviewer", "registeredBy": "5f1c…" },
      { "id": "c3a9…", "kind": "human", "name": "reviewer", "registeredBy": "77e2…" }
    ]
  }
}
```

**Usage**

```bash
cynapse participant resolve <name> [--kind <kind>]
```

| Option | Effect |
| --- | --- |
| `--kind <kind>` | Only this kind. Repeatable. |

## `cynapse participant list`

List participants, ordered by id. Each text line is `id  kind  name  status  [registered by unit]`. A
runtime starting after a crash lists what it registered and retires what it no longer runs. An empty
result prints `0 participants found`.

| Option | Effect |
| --- | --- |
| `--status <status>` | `live` or `retired`. Anything else exits `2`. |
| `--registered-by <participant>` | Only participants this unit registered. |
