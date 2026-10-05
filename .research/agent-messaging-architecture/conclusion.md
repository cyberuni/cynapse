# Conversation architecture for agent messaging — Conclusion

## Last updated

October 2026 (round 11)

## Question

What structure should cynapse, the communication layer for agents, start with, so that it
works from a solo developer up to an enterprise with thousands of projects and tens of
thousands of people and agents? It must also let humans inspect conversations and
decisions, and support work such as SDD missions and cyber-truss arbitration without being
tied to them.

The earlier sub-questions each have a round in changes.md:

1. How chat platforms model channels and DMs.
2. How well those models fit agents.
3. Workspace scoping.
4. Owning the store versus adapting to backends.
5. Per-recipient copies versus a log.
6. Multi-machine sync.
7. Collaboration use cases.
8. Comparison with beads and agent mail.
9. How work items in several stores relate, and what cynapse keeps of them.

## Verdict

### Scope: cynapse stores only what no other store can; it guides and composes

Each fact has one home. Work tracking stays where it lives: GitHub issues, PRs,
discussions and org projects, or Asana, Linear, or beads. cynapse's own store holds only
what no external store can, or what an external store lacks the capability for:

- channels: ordered, immutable entries with `seq`, such as ledgers, discussions between
  agents (arbitration) and coordination;
- leases and presence;
- read state.

Consumers (users, agents, custom UIs such as Cortex) talk to external stores directly.
cynapse holds no credentials for them, never calls them, and neither records nor caches
their changes. Instead it:

- **guides:** it tells a consumer what to fetch and how to read it, aiming at one call per
  store that returns a subject's native ID, metadata and relations. The timeline is a
  follow-up call that pages; no store returns a complete history in one call (LC13).
- **composes:** a consumer passes fetched data to cynapse and gets a structured result
  back. A change feed across stores is composed when it is read and never stored.

Messages refer to outside things by reference. Inside cynapse a reference is stored as a
shorthand (`gh:cyberuni/cynapse#12`). When posted out, it renders as a Markdown link or a
bare URL, whichever the platform supports.

### Structure: a network of subjects across stores

The structure follows DNA (Datum Network Architecture), an architecture any store that
can carry metadata can implement.

- **Subjects** are what a conversation can be about: an issue, a PR, a task, a
  repository, a participant, a mission. Each lives in the store that owns it.
- **A relation is metadata on both ends** (frontmatter, labels, custom fields), a doubly
  linked list. A reader treats a relation as present if either end records it, since the
  two writes are not atomic and either end can be edited from outside.
- **Hierarchy is a view, not identity.** Parent and child are relations.
- **A subject's type comes from its store; consumers attach perceived types.** SDD sees a
  `gh.issue` as an `sdd.mission`.

### Write-back

A consumer writes back to the subject's store only what changes the subject for that
store's readers, never the conversation:

1. A scope decision updates the description, plus a comment saying what changed, because
   a body edit leaves no timeline event (LC13).
2. A state record maps to a label or field, removed when the state clears.
3. A lifecycle milestone gets one summary comment: a PR opened, an escalation to a human,
   or the channel being reconciled.
4. A relation is written as metadata on the subjects.

The triggers are store-plugin conventions. Each write-back is linked both ways: a
`cynapse.published` entry in the channel, and a stamp on what was written.

### The core: channels of immutable entries

A **channel** is an ordered, append-only sequence of **entries**, and each channel has one
owner of its order. Every system that scaled chose this over per-recipient copies: Slack,
Discord, Telegram, Matrix and Kafka (LG04–LG08). Email threading shows how copies fail
(LG01–LG03). mcp_agent_mail stores the same split, one shared message row plus a row per
recipient for read and ack state (PR10, PR16).

- **Entry identity.** The writer mints a UUIDv7. Its first 48 bits are a Unix millisecond
  timestamp (RFC 9562), so it sorts by creation time. It is the entry's global identity and
  its idempotency key.
- **`seq`.** A per-channel integer assigned by the channel's order owner. It is *arrival*
  order, not creation order. It is needed because:
  - an offline writer's entries carry old timestamps and would otherwise land behind
    readers' cursors;
  - clocks disagree between machines;
  - only a contiguous sequence can reveal a gap (Telegram `pts`, TR03).

  It also gives a readable short reference, `handle#seq`. A UUIDv7 cannot be shortened by
  prefix, because the prefix is the timestamp.
- **Order owner by tier.** For solo use, SQLite's write transaction is the order owner:
  each CLI process assigns `seq` inside its write, with no daemon. Beyond one machine, the
  hub is the order owner.
- **Entries are immutable.** An edit or retraction is a new entry that points at the old
  one.
- **Reply tree.** An entry may have a `parent` entry, which makes a tree. A `root` field is
  set at write time so a whole thread can be queried without walking the parents (PR13).
- **Types and tags.** Each entry has one namespaced `type`, which decides how its payload
  is read. It can carry many namespaced `tags`, which are for filtering and grouping. A tag
  added later is itself a label entry, and the current set of tags is computed from those
  entries.

### Channels: identity, types, links, metadata

- **Two kinds, both keyed by subject.**
  - An **address channel** is keyed by something that can receive messages: a
    participant, a repository, a project, a folder. Its owner is the subject's owner.
  - A **work channel** is keyed by a unit of work: an issue, a PR, a task, a mission. It
    has members but no single owner.

  There is no DM. Telling a participant something means posting to their address
  channel.
- **Identity.** A UUID that never changes, plus a readable handle that can be renamed.
  Old handles stay as aliases.
  - A channel keyed by a subject gets `UUIDv5(the subject's native ID)`: GitHub's
    `node_id`, Asana's `gid`, Linear's UUID, or an address cynapse registers for a
    folder. The key has no type in it, so every consumer working on a subject meets in
    one channel.
  - A move gives the subject a new native ID (a GitHub transfer does, LC12). The new ID
    becomes an alias key of the same channel. The move is detected by resolving an old
    handle, which still leads to the moved subject.
  - A channel branched from an anchor entry gets `UUIDv5(anchor id)`.
  - Anything else gets a UUIDv7.

  Deriving the ID means two agents opening the same channel at once end up in one channel.
- **Each work item has its own channel.** A PR's channel is not a child of its issue's.
  Relations between work items are relations, not channel structure.
- **Types.** A channel keyed by an outside subject takes its type from the subject's
  store, and consumers attach perceived types. A channel native to cynapse, such as an
  arbitration, takes its type from the consumer that creates it (`truss.arbitration`).
  cynapse defines only generic traits: membership (open or fixed), retention, lifecycle
  states, whether members are woken, and the default view.
- **Child channels branch from an anchor entry in the parent.** Anchors are only for
  branching a conversation; they form a tree inside cynapse. For example, the parent
  gets an entry saying "arbitration needed" with a summary, and the child's parent is that
  entry. The branch point then sits in the parent's order. The outcome is written back to
  the parent as an entry that references the anchor. This follows Discord threads started
  from a message and Slack's thread root.
- **Metadata is an agent's briefing in one call:**
  - purpose;
  - members with roles and cursors;
  - context refs (issue, repo, branch, CR, parent anchor);
  - lifecycle and open state records;
  - pinned entries (summary, latest decision);
  - the names of the conventions that apply;
  - stats.

  Every metadata change is also written as an entry in the channel.

### State, views, and lifecycle

- **State records** hold what is true right now: leases, pending answers, needs-input, and
  lifecycle states such as `reconciled`. Every transition is also logged as an entry
  (LG17, LG18). Leases copy mcp_agent_mail's design: TTL, exclusive flag, path patterns,
  `released_ts`, and repair of orphaned leases (PR12).
- **Views** are saved filters. A distilled ledger is a view over the raw channel, and
  marking it `reconciled` is a state change, not a deletion. Removing raw entries
  physically is an optional retention step. If it is ever taken, the channel records the
  ranges it compacted, so readers can tell a gap they have not received from a range
  removed on purpose.
- **Summary entries** let a late joiner or a restarted session start from a checkpoint.
  Summarizing reconciled channels (beads' `bd compact`, PR08) fits here.

### Using the system: routing, conventions, stamps

- **`init-cynapse` owns setup and is safe to re-run.**
  - It writes the routes (which service handles each kind) to `.agents/cynapse.json`,
    including the kinds not yet set up.
  - It rewrites a delimited AGENTS.md block.
  - It writes project-tier convention overlays (`merge: merge-sections`) with IDs filled
    in. It delegates the IDs to the service's own init skill.
  - A CLI does the deterministic parts: `cynapse setup status|route|materialize|agents-md`.
- **Conventions are references,** fetched with one `reference show` per session, and each
  service's plugin owns its own. Names carry a plugin prefix (`cyber-asana.work-hierarchy`)
  because a project copy silently overrides every plugin's copy of a bare name (LC07,
  buddy-agent-harness#193).
- **Stamps.** A ledger write returns a stamp to paste into GitHub (as an HTML comment) or
  Asana (as a trailer line). The stamp makes a message machine-readable, prevents a
  duplicate post, and links the post back to the ledger.

### Backends and sync

- **Solo:** stock SQLite in WAL mode, embedded. Never a modified SQLite: the corruption in
  mcp_agent_mail_rust came from its custom engine, and stock SQLite backups of the same
  data verified clean (PR14, LC09). Load-test with 10 or more concurrent writers.
- **Multi-machine, team, enterprise:** a hub that owns `seq`, with the channel as the unit of
  partitioning, sync and access control (SY21, SY22). The data model maps onto NATS
  JetStream (SY08–SY10). Dolt is a second candidate: it syncs through the existing git
  remote with no hub to run (LC09), but its merge without a leader conflicts with
  owner-assigned `seq`.
- **Messages stay out of the repository.** Raw conversation (transcripts, answers,
  coordination, combat logs) lives in the database outside any repository, and agents read
  it through the CLI's budget flags, never through file search. Only a distilled result
  reaches the repository, as an intended artifact: an ADR through the `decision-record`
  route, or one summary per reconciled channel. This rests on hypothesis HY01, which is not
  yet tested (see "What should be checked again later"). SDD's raw combat log
  (`.agents/plans/*.log.jsonl`) is a candidate to move onto a cynapse channel.
- **External platforms hold subjects and relations, not channels.** That includes Slack,
  Linear, Asana, GitHub and beads (BK09, BK12, BK16). Their comments and stories can be
  edited and deleted and have no order owner, so channels stay in cynapse's store.
- **Don't sync through JSONL committed to git.** Beads tried it and moved to Dolt
  (PR03–PR05).

## Reference material

### Glossary

| Term | Meaning |
| --- | --- |
| participant | anything that reads or writes: an agent, a person, a service |
| channel | an ordered, append-only sequence of entries with one owner of its order |
| entry | one immutable item in a channel: a message, an event, an answer |
| subject | what a conversation is about, living in the store that owns it |
| relation | metadata on both subjects it links; present if either end records it |
| type | namespaced; a subject's comes from its store, a cynapse-native channel's or an entry's from its consumer |
| perceived type | a consumer's role for a subject, such as `sdd.mission` on a `gh.issue` |
| tag | a namespaced label; one added later arrives as an entry |
| anchor | the entry in a parent channel that a child channel branches from |
| view | a saved filter over entries, such as "distilled" |
| state | a mutable record on a channel or entry, with its transitions logged |
| cursor | a reader's position in a channel (its read or unread boundary) |

Examples of how consumers map onto these terms, not part of the core:

- **SDD:** a *mission* (one request, such as a feature or a bug fix) is a work channel. On
  an issue it is the issue's channel with the perceived type `sdd.mission`; without one it
  is a cynapse-native `sdd.mission` channel. Its raw ledger is every entry, and its distilled ledger is a view plus the state
  `reconciled`.
- **cyber-truss:** a *workflow* is the creation and propagation of changes across artifact
  sets. A run is perceived as `truss.run` on the work channel of what it works on, usually
  a mission's, and its ledger is entries there. *Arbitration* is how workflow agents
  discuss until they reach consensus. It is a `truss.arbitration` child channel, anchored
  at a `truss.arbitration-needed` entry in the mission's work channel. The members are the
  electorate, and the answers (`agree`, `disagree`, `uncontested/yield`, `request-recess`)
  are typed entries. The pending answers are state, and the decision is written back into
  the mission's work channel (LC08). Arbitrations are short-lived and stay in cynapse's
  store. If one stalls (cyber-truss decides what counts as a stall), the stall is written
  back to the work channel as an outcome entry that references the anchor, with a
  `needs-input` state record. The decider named by the consumer's convention gets the ask
  in their address channel, with a summary and a link, not the transcript. Their decision
  entry clears the state and closes the arbitration.

### Shape

```
channel { id (UUIDv5 from an anchor or subject ID | UUIDv7), keys (+aliases after a move),
         handle (+aliases), type, perceived types[], title,
         purpose, members[{participant, role, cursor}], context[refs], parent (anchor entry),
         traits {membership, retention, wake, default view}, state, pinned[], conventions[] }

entry  { id (UUIDv7, writer), channel, seq (owner), author, type, tags[], parent?, root?,
         refs[] (shorthands), body }
```

### Cost to change later

| Decision | Cost to change later |
| --- | --- |
| UUIDv7 entry IDs minted by the writer | **high** |
| `seq` per channel, owner-assigned (arrival order) | **high** |
| Entries immutable; a channel is the unit of partitioning, sync and access control | **high** |
| Channel IDs are UUIDs (v5 derived or v7); handles are separate and can be renamed | **high** |
| Channels keyed by the subject's native ID, with no type in the key | **high** |
| cynapse holds no credentials and never calls an external store | **high** |
| Relations as metadata on the subjects; hierarchy kept out of identity | medium-high |
| The `cynapse.published` entry shape | medium |
| Write-back triggers, relation names, whether DMs return | low |
| Children attach through an anchor entry | medium-high |
| Namespaced types defined by consumers, generic traits | medium |
| The reference shorthand format and how it renders | medium |
| Plugin-prefixed convention names | medium |
| Storage engine, sync transport, hub technology | low, behind the `Store` interface |

### Read contract for agents

Every read command supports unread-only, metadata-only, and start-from-latest-summary, plus
`--json`. mcp_agent_mail's `fetch_inbox(unread_only, include_bodies=false)` and
`summarize_thread` exist because agents burn tokens re-reading what they have already seen
(PR13).

## Confidence

- **High:** the channel-of-entries core, UUIDv7 entry IDs plus owner-assigned `seq`, and
  shared rows plus per-reader state. Several independent systems converge on these, and
  mcp_agent_mail confirms the row split.
- **High:** routing out to the systems of record, and plugin-prefixed conventions. The
  collision was tested directly.
- **High:** SQLite's write transaction as the local order owner on one machine. The load
  test held with up to 32 concurrent writers (LC10).
- **High:** that GitHub's native ID changes when an issue is transferred, so moves need
  alias keys. It was tested directly (LC12).
- **Medium:** one call per store for a subject's ID, metadata and relations. GitHub was
  run; GitLab, Linear and Asana are from documentation only (LC13).
- **Medium:** the hub technology (NATS or Dolt), and summarization on reconciled channels.

## Strongest supporting evidence

- The convergence on logs: LG04–LG08. The failure of copies in email: LG01–LG03.
- mcp_agent_mail's `messages` plus `message_recipients`: PR10, PR16.
- Slack's re-shard and Discord's snowflake IDs with partitioning by channel: SY21, SY22.
- The cyber-truss arbitration requirements (wake, hold the wait, escalate, write the
  decision to the run record): LC08.
- The reference collision, tested: LC07.
- The GitHub transfer test: LC12. The one-call check across stores: LC13.

## Strongest weakening or contradictory evidence

- SDD's per-writer ledger worked without an order, because its readers only check whether
  an entry exists (LC02).
- Leaderless systems (Dolt, git-bug, Matrix) handle offline peer-to-peer work that a single
  order owner cannot while the owner is unreachable (SY07, SY17, LC09).
- mcp_agent_mail's corruption shows that local SQLite under a swarm of agents is a real
  failure surface, even if stock SQLite is not the cause (PR14).
- Beads needed several documents for multi-machine federation (PR09), so "hub later" may be
  underestimating the work.

## What is not supported

- That any existing tool or platform provides the full model (channels, `seq`, cursors, a
  typed ledger, anchors) off the shelf.
- Beads or Dolt as cynapse's backend today.
- That NATS leaf nodes buffer writes durably while offline.

## Where evidence is thin

- `bd compact` and AgentMail's internal storage model (snippet-only, PR08).
- Discord's thread-from-message ID behavior (from memory).
- HY01, the claim that messages stored in a repository hurt agent sessions (one anecdote,
  LC11; not measured).
- GitHub sub-issues (from memory).
- GitLab, Linear and Asana single-call queries, and their ID stability across moves
  (documentation cited from memory, LC13).
- Everything about Reddit (secondary sources only).

## What should be checked again later

- HY01: run the two-copy test in its evidence entry before relying on "messages stay out
  of the repository" as more than a design judgement.
- Dolt as a sync layer that needs no hub, and how it could coexist with owner-assigned
  `seq`.
- Whether cyber-truss arbitration ever spans more than one mission.
- The migration path for universal-plugin's unprefixed reference names.
- Run the GitLab, Linear and Asana one-call queries for real (LC13), and recheck Asana once
  cyberuni/cyber-asana#235 lands.
- How often a subject moves before anyone resolves an old handle, which leaves two
  channels for one subject until they are linked.
