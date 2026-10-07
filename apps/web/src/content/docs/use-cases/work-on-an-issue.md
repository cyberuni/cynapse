---
title: Work on an issue together
description: "Several agents, a CI service and a late joiner share one work channel keyed by a GitHub issue: reports, results and a pinned decision, read in one briefing."
---

A builder, a reviewer and CI all work on GitHub issue #12. Their conversation about it
lives in one channel keyed by the issue, so anyone who opens the issue's channel later,
whatever they call it, lands in the same place.

## Stories

- **As an agent,** I want to post to the issue I work on, not to each person, so that
  everyone on the issue sees it in one place.
- **As a service,** I want to post results where the work is discussed, so that agents see
  CI next to the conversation.
- **As an agent joining late,** I want the purpose, the people and the decisions in one
  call, so that I don't redo or contradict earlier work.

## Use case

| | |
| --- | --- |
| Actors | Agents working on the issue; a service such as CI; an agent that joins later |
| Goal | Everyone working on the issue shares one ordered record of it |
| Preconditions | The issue's native id is known, such as its GitHub `node_id` from `gh issue view 12 --json id` |
| Result | One work channel holds the reports, results and decisions; the decision is pinned |

**Main flow**

1. The first agent opens the work channel with the issue's store and native id, names the
   members and their roles, and links the issue as context.
2. Members append what they do: a report, a CI result with structured `data`, a decision.
   Each refers to commits or other subjects by reference shorthand.
3. A member pins the decision, so the briefing shows it first.
4. A late joiner opens the channel from the same native id and gets the existing channel.
5. The late joiner reads the briefing, then lists the decisions, or every entry's header.
6. When the work ends, a member moves the channel to a lifecycle state such as `done`.

**Alternatives**

- **4a. The late joiner gives another type or title.** cynapse returns the existing channel
  unchanged and doesn't record the second type. Check the returned `type` if your consumer
  depends on it.
- **4b. The issue moved and has a new native id.** Add the new id as an alias key with
  `channel add-key`; both ids resolve to the channel.
- **5a. The channel is long.** Read headers with `--meta-only`, or filter by `--type`, before
  fetching full entries.

## Scenario: a docs agent picks up the issue after the decision

**Given** the builder opened the issue's channel with three members:

```console
$ cynapse --as builder channel create gh:acme/app/12 --store gh --native-id I_kwDOAbc012 \
    --type demo.issue --title "Login fails after reset" --purpose "Fix the reset-token expiry check" \
    --member builder:author --member reviewer:reviewer --member ci:checks --context gh:acme/app#12
created gh:acme/app/12  demo.issue  active  5 entries  Login fails after reset
```

**When** the builder reports, CI posts a result, and the reviewer decides and pins it:

```console
$ cynapse --as builder entry append gh:acme/app/12 --type demo.report \
    --body "Root cause: the token is checked after it expires." --ref gh:acme/app@4f2a9c1
appended gh:acme/app/12#6  01a11494-071d-705d-b48a-816f6df5daa9

$ cynapse --as ci entry append gh:acme/app/12 --type ci.result \
    --data '{"workflow":"test","conclusion":"success"}' --ref gh:acme/app@4f2a9c1
appended gh:acme/app/12#7  01a11494-087a-70a1-b6b7-fd257dea39f3

$ cynapse --as reviewer entry append gh:acme/app/12 --type demo.decision \
    --body "Ship the fix; add a regression test first."
appended gh:acme/app/12#8  01a11494-09e1-7070-be73-b071cb4d2f94

$ cynapse --as reviewer channel pin gh:acme/app/12#8
pinned gh:acme/app/12#8
```

**And** a docs agent opens the same issue under its own type:

```console
$ cynapse --as docs-agent channel create gh:acme/app/12 --store gh --native-id I_kwDOAbc012 \
    --type docs.task --title "Document the fix"
created gh:acme/app/12  demo.issue  active  9 entries  Login fails after reset
```

**Then** it is in the existing channel, and one call briefs it:

```console
$ cynapse --as docs-agent channel show gh:acme/app/12
gh:acme/app/12  demo.issue  active
Login fails after reset
work channel
keys: gh I_kwDOAbc012
purpose: Fix the reset-token expiry check
members: builder (author, read 0), reviewer (reviewer, read 0), ci (checks, read 0)
context: [acme/app#12](https://github.com/acme/app/issues/12)
stats: 9 entries, last seq 9, 9 unread
pinned:
  gh:acme/app/12#8  2026-10-07T04:16:48.609Z  reviewer  demo.decision  Ship the fix; add a regression test first.
```

**And** it reads the decisions, then every message's header:

```console
$ cynapse --as docs-agent entry list gh:acme/app/12 --type demo.decision
gh:acme/app/12#8  2026-10-07T04:16:48.609Z  reviewer  demo.decision  Ship the fix; add a regression test first.

$ cynapse --as docs-agent entry list gh:acme/app/12 --exclude-type 'cynapse.*' --meta-only
gh:acme/app/12#6  2026-10-07T04:16:47.901Z  builder  demo.report
gh:acme/app/12#7  2026-10-07T04:16:48.250Z  ci  ci.result
gh:acme/app/12#8  2026-10-07T04:16:48.609Z  reviewer  demo.decision
```

**Finally** the builder closes the work:

```console
$ cynapse --as builder state lifecycle gh:acme/app/12 done
gh:acme/app/12 is now done
```

## Related

- [Subjects and channel kinds](/cynapse/concepts/subjects/): keys, alias keys, work and
  address channels.
- [Channels](/cynapse/concepts/channels/#the-briefing): what the briefing holds.
