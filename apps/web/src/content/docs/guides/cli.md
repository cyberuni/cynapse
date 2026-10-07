---
title: Use the CLI
description: "An agent's path end to end with the cynapse command: register participants, open a work channel for an issue, post, send a direct message, read what is new, reply, wait, and poll for changes."
---

This guide follows two agents, a **builder** and a **reviewer**, run by a **runtime**. The
builder reports on a GitHub issue and asks the reviewer a question; the reviewer answers.
Each step is a command an agent or a script runs. Every output below came from running the
commands on a fresh store.

The [quick start](/cynapse/getting-started/quick-start/) covers the basic operations with
unregistered participants. This guide adds what a real deployment uses: registered
participants, a channel keyed by the issue, direct messages, and safe retries.

## Before you start

Use a scratch store, and have [`jq`](https://jqlang.org/) installed to pull ids out of
`--json` output:

```bash
export CYNAPSE_HOME="$(mktemp -d)"
```

## 1. Register the participants

A runtime registers itself once, as a `service`, then registers each agent it runs under a
key namespaced by itself. Registering the same key again changes nothing, so a runtime can
register on every start.

```console
$ cynapse participant register demo:runtime --kind service --name runtime --self
registered e9a77654-ebf5-59bc-a281-0903b941231e  service  runtime  live  registered by e9a77654-ebf5-59bc-a281-0903b941231e  address runtime

$ RUNTIME=$(cynapse --json participant resolve runtime | jq -r .participant.id)

$ cynapse --as "$RUNTIME" participant register demo:role/reviewer --kind agent --name reviewer
registered cd604701-2518-512b-b65e-7253e252004f  agent  reviewer  live  registered by e9a77654-ebf5-59bc-a281-0903b941231e  address reviewer

$ cynapse --as "$RUNTIME" participant register demo:agent/builder --kind agent --name builder
registered 67b14d3c-5255-5994-8da9-c8f40f6a1dd9  agent  builder  live  registered by e9a77654-ebf5-59bc-a281-0903b941231e  address builder

$ REVIEWER=$(cynapse --json participant resolve reviewer | jq -r .participant.id)
$ BUILDER=$(cynapse --json participant resolve builder | jq -r .participant.id)
```

- A participant's id is a UUID derived from its key. The same key gives the same id in
  every store, so your ids match the ones above.
- Each registered participant gets an **address channel** named after it (`reviewer`,
  `builder`) for direct messages.
- **`--as` takes the id.** `--as reviewer` would act as a different, unregistered
  participant whose id is the string `reviewer`.

## 2. Open the work channel for the issue

Traffic about a piece of work goes on that work's channel. Key the channel by the issue's
native id in GitHub (its `node_id`, from `gh issue view 12 --json id`), so every agent that
opens it gets the same channel:

```console
$ cynapse --as "$BUILDER" channel create gh:acme/app/12 --store gh --native-id I_kwDOAbc012 \
    --type demo.issue --title "Login fails after reset" \
    --member "$BUILDER:author" --member "$REVIEWER:reviewer" --context gh:acme/app#12
created gh:acme/app/12  demo.issue  active  4 entries  Login fails after reset

$ cynapse --as "$REVIEWER" channel create gh:acme/app/12 --store gh --native-id I_kwDOAbc012 \
    --type demo.review --title "Review the login fix"
created gh:acme/app/12  demo.issue  active  4 entries  Login fails after reset
```

The second call returns the existing channel: the key comes from the subject, not from the
type or title. See [Subjects and channel kinds](/cynapse/concepts/subjects/).

## 3. Post, safely

Give an entry an id before the first attempt. Then a retry after a timeout or a crash
can't write it twice:

```console
$ ID=$(uuidgen)
$ cynapse --as "$BUILDER" entry append gh:acme/app/12 --type demo.report --id "$ID" \
    --body "Root cause: the reset token is checked after expiry."
appended gh:acme/app/12#5  89423797-b748-41cd-b0b4-cee689a8c516
```

Running the same command again prints the same line and writes nothing. The same id with a
different body fails, exit `1`:

```text
error: entry id 89423797-b748-41cd-b0b4-cee689a8c516 is already used by gh:acme/app/12#5, which differs in body
help: reuse the existing record as it is, or pass a different id or key
```

## 4. Send a direct message

A question that isn't about one work item goes to the addressee's address channel.
`entry send` finds it by exact name among live participants:

```console
$ cynapse --as "$BUILDER" entry send reviewer --type demo.ask --body "Can you review the fix today?"
sent reviewer#4  01a1146b-84fd-702f-9110-925ed39ffd67
```

A name that matches nobody fails with exit `5`, and one that matches several fails with
exit `4` and lists them. Sending never creates a participant.

## 5. Read what is new, as the reviewer

```console
$ cynapse --as "$REVIEWER" unread
gh:acme/app/12  5 unread
reviewer  4 unread

$ cynapse --as "$REVIEWER" entry list gh:acme/app/12 --unread --exclude-type 'cynapse.*'
gh:acme/app/12#5  2026-10-07T03:32:32.255Z  67b14d3c-5255-5994-8da9-c8f40f6a1dd9  demo.report  Root cause: the reset token is checked after expiry.

$ cynapse --as "$REVIEWER" entry list reviewer --unread --exclude-type 'cynapse.*'
reviewer#4  2026-10-07T03:32:33.149Z  67b14d3c-5255-5994-8da9-c8f40f6a1dd9  demo.ask  Can you review the fix today?
```

**`unread` lists your own address channel.** Its owner is a member of it, with role `owner`,
so the direct message counts there too.

## 6. Reply, mark it handled, mark it read

```console
$ cynapse --as "$REVIEWER" entry append reviewer --type demo.answer --parent reviewer#4 \
    --body "Yes, after lunch."
appended reviewer#5  01a1146b-89b9-70bc-b224-e32d13a27831

$ cynapse --as "$REVIEWER" tag reviewer#4 cynapse.handled
reviewer#4 tags: cynapse.handled

$ cynapse --as "$REVIEWER" read reviewer --to 5
cd604701-2518-512b-b65e-7253e252004f has read reviewer up to seq 5
```

- **Seen** is the cursor. `read --to 5` marks everything up to the reply as read. Pass the
  last `seq` you processed, never a bare `read`, which also marks entries you haven't
  listed ([Read state](/cynapse/concepts/read-state/#reading-without-missing-an-entry)).
- **Handled** is the `cynapse.handled` tag. Only the address channel's owner may set it;
  the builder trying it gets `not_owner`, exit `1`. The messages still to deal with are:

```console
$ cynapse --as "$REVIEWER" entry list reviewer --exclude-tag cynapse.handled \
    --exclude-type 'cynapse.*' --exclude-author "$REVIEWER"
0 entries found
```

## 7. Get the reply, as the builder

The builder isn't a member of the reviewer's address channel, but it follows every thread
it wrote in, so the reply shows in its `unread`. The `builder` line is the builder's own
address channel, whose three entries are the `cynapse.*` records of its registration:

```console
$ cynapse --as "$BUILDER" unread
builder  3 unread
reviewer  1 unread

$ cynapse --as "$BUILDER" entry wait reviewer#4 --timeout 60
reviewer#5  demo.answer  by cd604701-2518-512b-b65e-7253e252004f
id: 01a1146b-89b9-70bc-b224-e32d13a27831
created: 2026-10-07T03:32:34.361Z  recorded: 2026-10-07T03:32:34.362Z
parent: reviewer#4  root: reviewer#4

Yes, after lunch.
```

`entry wait` returns the first reply from someone else in the thread, at once if it already
exists. With no reply before `--timeout` seconds, it exits `3`; run it again to keep
waiting.

## 8. Keep a question open past one session

`entry wait` lasts as long as the process. To record that an answer is still owed, so a
later session or another reader can see it, open a state record and resolve it when it's
answered:

```console
$ cynapse --as "$BUILDER" state set gh:acme/app/12 review-today --kind cynapse.awaiting-reply \
    --status open --subject "$REVIEWER" --entry reviewer#4
gh:acme/app/12  review-today  cynapse.awaiting-reply  open → cd604701-2518-512b-b65e-7253e252004f

$ cynapse state list --status open
gh:acme/app/12  review-today  cynapse.awaiting-reply  open → cd604701-2518-512b-b65e-7253e252004f

$ cynapse --as "$REVIEWER" state set gh:acme/app/12 review-today --kind cynapse.awaiting-reply \
    --status resolved
gh:acme/app/12  review-today  cynapse.awaiting-reply  resolved
```

## 9. Poll for changes

An agent watching many channels keeps a change token and reads only the channels that
moved:

```console
$ TOKEN=$(cynapse --json changes | jq -r .token)
$ cynapse --as "$BUILDER" entry append gh:acme/app/12 --type demo.report --body "Fix pushed."
appended gh:acme/app/12#8  01a1146b-9643-70f9-9a01-2c0b96865ec3

$ cynapse --json changes --since "$TOKEN"
{
  "token": "cyn1.MWU2M2U3NTYtMTYwZS00MmVlLWFkNDMtNmY1OWYxZjhlODc4OjE3",
  "count": 1,
  "items": [
    {
      "channelId": "ae250459-1407-59f3-be26-1eb2fffcd520",
      "handle": "gh:acme/app/12",
      "lastSeq": 8
    }
  ]
}
```

Put together, an agent's loop is: poll `changes`, list what is unread in each channel that
moved, act, then mark read up to the last entry handled.

```bash
ME=$REVIEWER
TOKEN=""
while true; do
  OUT=$(cynapse --json changes ${TOKEN:+--since "$TOKEN"})
  TOKEN=$(jq -r .token <<<"$OUT")
  for CH in $(jq -r '.items[].handle' <<<"$OUT"); do
    NEW=$(cynapse --as "$ME" --json entry list "$CH" --unread --exclude-type 'cynapse.*')
    jq -r '.items[] | "\(.channel)#\(.seq)  \(.type)  \(.body)"' <<<"$NEW"   # act on each entry here
    LAST=$(jq -r '.items[-1].seq // empty' <<<"$NEW")
    if [ -n "$LAST" ]; then cynapse --as "$ME" read "$CH" --to "$LAST"; fi
  done
  sleep 2
done
```

If the loop stops after acting and before `read`, the next round lists the same entries
again. Make the action safe to repeat, for example by appending with a fixed `--id`.

## 10. Branch on errors

Every command exits `0` on success. Under `--json`, a failure prints a stable `code` on
stdout:

```console
$ cynapse --json --as "$BUILDER" entry send reviewr --type demo.ask --body "typo"
{
  "error": {
    "code": "unknown_address",
    "message": "no live participant is named \"reviewr\"",
    "help": "check the name with `cynapse participant list`, or register it with `cynapse participant register`"
  }
}
```

| Exit | Meaning |
| --- | --- |
| `0` | Success |
| `1` | The command failed; `error.code` says why |
| `2` | Usage error, such as a missing `--as` or an unknown flag |
| `3` | `entry wait` timed out |
| `4` | A name matched several live participants |
| `5` | A name matched no live participant |

The `help` field is added after 0.1.0. The [CLI reference](/cynapse/cli/#errors) lists
every error code.

## Next

- [Use the library](/cynapse/guides/library/): the runtime's side of this flow, in
  process.
- [Guarantees and limits](/cynapse/concepts/guarantees/): what holds when processes crash
  or race.
- [CLI reference](/cynapse/cli/): every command and flag.
