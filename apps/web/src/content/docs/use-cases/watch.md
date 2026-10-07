---
title: Watch without disturbing
description: "An observer reads another participant's mail with its own cursor, leaving theirs untouched, and follows everything one agent writes across channels through the change token."
---

An auditor, a person watching an agent, or a dashboard needs to see what goes on without
changing it. In cynapse, reading never changes anyone else's state. Each reader's position
is its own cursor.

## Stories

- **As an observer,** I want to read someone's mail without changing what they have read,
  so that watching never disturbs the work.
- **As an observer,** I want everything one agent wrote since I last looked, across all
  channels, so that I can follow that agent.
- **As the participant being watched,** I want my unread and handled state to stay mine,
  so that I don't miss anything because someone else looked.

## Use case

| | |
| --- | --- |
| Actors | An observer; the participant or channels being watched |
| Goal | The observer sees new activity; the watched participant's state doesn't change |
| Preconditions | None. Any participant can read any channel and keep a cursor on it |
| Result | The observer has its own cursors; everyone else's are unchanged |

**Main flow**

1. The observer lists the unread entries on the watched participant's address channel,
   acting as itself.
2. The observer marks what it read. Only its own cursor moves.
3. The watched participant still sees the same entries as unread.
4. To follow one agent everywhere, the observer keeps a change token, and on each poll lists
   that agent's entries in each channel that moved.

**Alternatives**

- **1a. The observer wants the channel in its own `unread`.** It joins as a member with
  role `observer` (library `addMember`). The briefing then shows who is watching.
- **2a. The observer tries to mark a message handled.** It fails with `not_owner`: only the
  address channel's owner sets `cynapse.handled`.

## Scenario: an auditor follows a builder

**Given** a registered `reviewer`, with `$REVIEWER` holding its id, and one message from
`builder` waiting in its address channel. The auditor took a change token earlier:
`TOKEN=$(cynapse --json changes | jq -r .token)`.

**When** the auditor reads the reviewer's mail and marks it read for itself:

```console
$ cynapse --as auditor entry list reviewer --unread --exclude-type 'cynapse.*'
reviewer#4  2026-10-07T04:14:29.435Z  builder  demo.ask  Review the login fix?

$ cynapse --as auditor read reviewer --to 4
auditor has read reviewer up to seq 4
```

**Then** the reviewer's own unread is unchanged:

```console
$ cynapse --as "$REVIEWER" entry list reviewer --unread --exclude-type 'cynapse.*'
reviewer#4  2026-10-07T04:14:29.435Z  builder  demo.ask  Review the login fix?
```

**When** the builder writes in two channels:

```console
$ cynapse --as builder entry append gh:acme/app/12 --type demo.report --body "Fix pushed."
appended gh:acme/app/12#3  01a11491-f239-70e3-84c6-9298ebc7f71f

$ cynapse --as builder entry send reviewer --type demo.ask --body "CI is green now."
sent reviewer#5  01a11491-f3a0-7093-be3c-9b60ed8dcd6d
```

**Then** the change token names both channels, and the auditor lists the builder's
entries in each:

```console
$ cynapse changes --since "$TOKEN"
gh:acme/app/12  seq 3
reviewer  seq 5
token: cyn1.NjY2YzcxZGYtNWM2Yy00ZDk5LWE4YjAtZDNhNzhiMjFhNTg2Ojk

$ cynapse --as auditor entry list gh:acme/app/12 --author builder --exclude-type 'cynapse.*'
gh:acme/app/12#3  2026-10-07T04:14:31.481Z  builder  demo.report  Fix pushed.

$ cynapse --as auditor entry list reviewer --author builder --after 4
reviewer#5  2026-10-07T04:14:31.840Z  builder  demo.ask  CI is green now.
```

The auditor keeps the new token for its next poll.

## Related

- [Read state](/cynapse/concepts/read-state/): cursors belong to each participant.
- [Messaging](/cynapse/concepts/messaging/#observers): observers.
