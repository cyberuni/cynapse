---
title: What is cynapse
description: "A local message store for agents: ordered channels of entries, a read cursor per participant, addressing, waiting and change polling, in one SQLite file. What it guarantees and what it deliberately doesn't do."
---

cynapse is a message store for agents and the people working with them. It keeps their
conversations as ordered logs in one SQLite file on your machine, and lets each participant
read them at its own pace. You use it through a command, `cynapse`, or as a Node library.

It sits where a database would sit in an application: a layer other tools build on. A
runtime that launches agents uses it to pass messages between them. An agent uses it to
report, ask, answer and pick up what is new since it last looked.

## What it gives you

- **Channels of entries.** A channel is an append-only log. Each entry gets a `seq`, its
  position in the channel, with no gaps, so "what is new since 5" always has an exact
  answer.
- **A cursor per reader.** Each participant has its own read position in each channel.
  Reading as one participant never changes what another has read.
- **Threads and waiting.** A reply names the entry it answers. A participant can wait for
  the first reply to its question.
- **Addressing.** A runtime registers its agents. Others send to them by name, and a name
  that matches nobody, or several, fails instead of guessing.
- **Channels keyed by subject.** The channel for GitHub issue #12 is the same channel for
  every agent that opens it, derived from the issue's id.
- **State records.** What is true now, such as "waiting on the reviewer", next to the log
  of how it got there.
- **A change token.** One cheap call tells a poller which channels moved since it last
  asked.
- **No server.** Many processes on one machine share the file. SQLite orders the writes.

[The model](/cynapse/concepts/) describes each part, and the
[quick start](/cynapse/getting-started/quick-start/) uses them in a dozen commands.

## What it guarantees

In short: each channel has one gap-free order; an append with an id is safe to retry; a
change and its log entry commit together; a committed write survives a process crash; a
reader that marks read only what it processed never loses an entry. Each promise has
limits, such as one machine and one writer at a time.
[Guarantees and limits](/cynapse/concepts/guarantees/) states them exactly.

## What it doesn't do

- **It doesn't track work.** Issues, tasks and pull requests stay in GitHub, Asana, Linear
  or beads. cynapse holds the conversation about them, and refers to them as strings such
  as `gh:cyberuni/cynapse#12`.
- **It doesn't call other systems.** It holds no credentials and makes no network calls.
- **It doesn't push or wake anyone.** Readers poll. A runtime decides whom to wake.
- **It doesn't span machines.** One store is one file on one host. Sync through a hub is
  designed, not built.
- **It doesn't verify identity.** It records the participant each call names.
- **It doesn't hand out work.** Every reader sees every entry; there are no competing
  consumers or leases yet.

## Who it is for

- **Runtimes** that launch and manage agent sessions, such as
  [cyberlegion](https://github.com/cyberuni/cyberlegion). They register agents, relay
  messages and poll for changes through the library
  ([Use the library](/cynapse/guides/library/)).
- **Agents** that talk to each other and to people through the CLI, whose output is built
  for them to parse ([Use the CLI](/cynapse/guides/cli/)).
- **Tools and viewers** that read the conversation, such as the web viewer that
  [`cynapse gui`](/cynapse/cli/gui/) starts.

## Status

The latest release is `0.1.0`. It runs on one machine, and its library interface, `--json`
shapes and error codes are a [public contract](/cynapse/public-contract/). cynapse is
still a prototype: the hub, leases and the tools for reading other stores are designed and
not built. [Status](/cynapse/design/status/) lists what is built and what isn't.

cynapse started as the messaging layer inside cyberlegion and was moved out so any unit
can depend on it. The design and its decisions are under [Design](/cynapse/design/).

## Next

- [Install](/cynapse/getting-started/install/)
- [Quick start](/cynapse/getting-started/quick-start/)
- [Guarantees and limits](/cynapse/concepts/guarantees/)
