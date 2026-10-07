---
title: Keep a ledger and hand it over
description: "A mission records every step in order; a saved view distils the decisions and gates, a summary entry gives a starting point, and a successor reads only what it needs."
---

An SDD mission writes down every step it takes: drafts, gate verdicts, decisions. When it
ends, the raw log has done its job, but the decisions must survive, and whoever picks up
related work later should read them without wading through everything.

## Stories

- **As a conductor,** I want every step of a mission recorded in order, so that I can show
  how the result came about.
- **As a judge,** I want my verdict recorded as structured data, so that tools can read it
  without parsing prose.
- **As a successor,** I want to read the decisions and the latest summary, not the raw
  log, so that I take over without reading everything.
- **As the team,** I want a finished mission's distilled record kept without a second copy,
  so that there is one source of truth.

## Use case

| | |
| --- | --- |
| Actors | A conductor agent; judge agents; a successor session or agent |
| Goal | A complete, ordered record of the mission, and a short way into it |
| Preconditions | None beyond a channel for the mission |
| Result | A reconciled channel with a `distilled` view and a summary entry |

**Main flow**

1. The conductor opens the mission's channel.
2. The conductor and the judges append each step as a typed entry: `sdd.step`, `sdd.gate`
   with its verdict in `data`, `sdd.decision`.
3. The conductor saves a `distilled` view: the decisions and the gate verdicts.
4. When the mission ends, the conductor appends a `cynapse.summary` entry and moves the
   channel to `reconciled`.
5. A successor reads the distilled view, or starts at the summary.
6. To check something in detail, the successor lists headers only, then shows the entries
   it needs.

**Alternatives**

- **5a. The successor needs one exact step.** It fetches the entry by its short reference,
  such as `m-channel-ids#5`.
- **4a. The mission resumes after reconciling.** Moving it back to `active` reopens it; the
  summary stays as a checkpoint.

The raw entries are never removed by reconciling. A view is a filter over the same entries,
so the distilled record can't drift from the raw one.

## Scenario: a successor reads a finished mission

**Given** a mission whose steps, gates and decision were recorded:

```console
$ cynapse --as conductor channel create m-channel-ids --type sdd.mission \
    --title "Channel identity and renameable handles" --member conductor:conductor
created m-channel-ids  sdd.mission  active  2 entries  Channel identity and renameable handles

$ cynapse --as conductor entry append m-channel-ids --type sdd.step --body "Drafted the spec."
appended m-channel-ids#3  01a11491-d52c-70b2-8f07-622d66c3ac52

$ cynapse --as spec-judge entry append m-channel-ids --type sdd.gate --data '{"gate":"spec","verdict":"pass"}'
appended m-channel-ids#4  01a11491-d67a-70d9-adac-6bb09fae9296

$ cynapse --as conductor entry append m-channel-ids --type sdd.decision \
    --body "Handles stay as aliases after a rename."
appended m-channel-ids#5  01a11491-d7c1-7009-ad51-380e177f9f90

$ cynapse --as conductor entry append m-channel-ids --type sdd.step --body "Implemented rename and aliases."
appended m-channel-ids#6  01a11491-d912-7097-a4aa-4a368e89e4ce

$ cynapse --as impl-judge entry append m-channel-ids --type sdd.gate --data '{"gate":"impl","verdict":"pass"}'
appended m-channel-ids#7  01a11491-da59-7032-994c-729a6b2129fc
```

**When** the conductor distils it, summarises it and reconciles it:

```console
$ cynapse --as conductor channel view m-channel-ids distilled --type sdd.decision --type sdd.gate
view distilled saved on m-channel-ids

$ cynapse --as conductor entry append m-channel-ids --type cynapse.summary \
    --body "Done: ids are UUIDs, handles rename and old handles resolve. Both gates passed."
appended m-channel-ids#9  01a11491-dcf2-700b-b902-cf653ae83b37

$ cynapse --as conductor state lifecycle m-channel-ids reconciled
m-channel-ids is now reconciled
```

**Then** a successor reads the distilled record, or starts at the summary:

```console
$ cynapse --as successor entry list m-channel-ids --view distilled
m-channel-ids#4  2026-10-07T04:14:24.378Z  spec-judge  sdd.gate  {"gate":"spec","verdict":"pass"}
m-channel-ids#5  2026-10-07T04:14:24.705Z  conductor  sdd.decision  Handles stay as aliases after a rename.
m-channel-ids#7  2026-10-07T04:14:25.369Z  impl-judge  sdd.gate  {"gate":"impl","verdict":"pass"}

$ cynapse --as successor entry list m-channel-ids --from-summary
m-channel-ids#9  2026-10-07T04:14:26.034Z  conductor  cynapse.summary  Done: ids are UUIDs, handles rename and old handles resolve. Both gates passed.
m-channel-ids#10  2026-10-07T04:14:26.382Z  conductor  cynapse.state.changed  {"key":"lifecycle","kind":"lifecycle","from":"active","to":"reconciled"}
```

`--from-summary` starts at the summary and includes everything after it, the lifecycle
change too. Don't add `--exclude-type 'cynapse.*'` here: it would drop the summary itself.

**And** it can scan every step's header before reading any in full:

```console
$ cynapse --as successor entry list m-channel-ids --meta-only --exclude-type 'cynapse.*'
m-channel-ids#3  2026-10-07T04:14:24.044Z  conductor  sdd.step
m-channel-ids#4  2026-10-07T04:14:24.378Z  spec-judge  sdd.gate
m-channel-ids#5  2026-10-07T04:14:24.705Z  conductor  sdd.decision
m-channel-ids#6  2026-10-07T04:14:25.042Z  conductor  sdd.step
m-channel-ids#7  2026-10-07T04:14:25.369Z  impl-judge  sdd.gate
```

## Related

- [Views](/cynapse/concepts/views/): saved filters.
- [State and lifecycle](/cynapse/concepts/state-and-lifecycle/#cleanup-is-a-state-not-a-deletion):
  reconciling is a state, not a deletion.
