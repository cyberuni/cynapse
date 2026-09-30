# Conversation architecture for agent messaging — Conclusion

## Last updated

September 2026 (round 9)

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

## Verdict

### Scope: cynapse owns only communication that has no home elsewhere

cynapse owns:

- ledgers of what happened;
- discussions between agents, such as arbitration;
- coordination;
- change feeds;
- leases and presence;
- read state.

Work tracking stays where it lives: GitHub issues, PRs, discussions and org projects, or
Asana, Linear, or beads. Agents use those services directly through their own CLIs or MCP
servers, and cynapse neither wraps nor indexes them. Messages refer to those systems by
reference. Inside cynapse a reference is stored as a shorthand (`gh:cyberuni/cynapse#12`).
When posted out, it renders as a Markdown link or a bare URL, whichever the platform
supports.

### The core: streams of immutable entries

A **stream** is an ordered, append-only sequence of **entries**, and each stream has one
owner of its order. Every system that scaled chose this over per-recipient copies: Slack,
Discord, Telegram, Matrix and Kafka (LG04–LG08). Email threading shows how copies fail
(LG01–LG03). mcp_agent_mail stores the same split, one shared message row plus a row per
recipient for read and ack state (PR10, PR16).

- **Entry identity.** The writer mints a UUIDv7. Its first 48 bits are a Unix millisecond
  timestamp (RFC 9562), so it sorts by creation time. It is the entry's global identity and
  its idempotency key.
- **`seq`.** A per-stream integer assigned by the stream's order owner. It is *arrival*
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

### Streams: identity, types, links, metadata

- **Identity.** A UUID that never changes, plus a readable handle that can be renamed.
  Old handles stay as aliases.
  - A stream branched from an anchor entry gets `UUIDv5(anchor id)`.
  - A stream with a natural key, such as a DM's set of participants, gets
    `UUIDv5(canonical key)`.
  - Anything else gets a UUIDv7.

  Deriving the ID means two agents opening the same stream at once end up in one stream.
- **Types are namespaced and defined by consumers,** such as `sdd.mission` or
  `truss.arbitration`. cynapse defines only generic traits: membership (open or fixed),
  retention, lifecycle states, whether members are woken, and the default view.
- **Child streams branch from an anchor entry in the parent.** For example, the parent
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

  Every metadata change is also written as an entry in the stream.

### State, views, and lifecycle

- **State records** hold what is true right now: leases, pending answers, needs-input, and
  lifecycle states such as `reconciled`. Every transition is also logged as an entry
  (LG17, LG18). Leases copy mcp_agent_mail's design: TTL, exclusive flag, path patterns,
  `released_ts`, and repair of orphaned leases (PR12).
- **Views** are saved filters. A distilled ledger is a view over the raw stream, and
  marking it `reconciled` is a state change, not a deletion. Removing raw entries
  physically is an optional retention step. If it is ever taken, the stream records the
  ranges it compacted, so readers can tell a gap they have not received from a range
  removed on purpose.
- **Summary entries** let a late joiner or a restarted session start from a checkpoint.
  Summarizing reconciled streams (beads' `bd compact`, PR08) fits here.

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
- **Multi-machine, team, enterprise:** a hub that owns `seq`, with the stream as the unit of
  partitioning, sync and access control (SY21, SY22). The data model maps onto NATS
  JetStream (SY08–SY10). Dolt is a second candidate: it syncs through the existing git
  remote with no hub to run (LC09), but its merge without a leader conflicts with
  owner-assigned `seq`.
- **Messages stay out of the repository.** Raw conversation (transcripts, answers,
  coordination, combat logs) lives in the database outside any repository, and agents read
  it through the CLI's budget flags, never through file search. Only a distilled result
  reaches the repository, as an intended artifact: an ADR through the `decision-record`
  route, or one summary per reconciled stream. This rests on hypothesis HY01, which is not
  yet tested (see "What should be checked again later"). SDD's raw combat log
  (`.agents/plans/*.log.jsonl`) is a candidate to move onto a cynapse stream.
- **External platforms are routing destinations, not backends.** That includes Slack,
  Linear, Asana, GitHub and beads (BK09, BK12, BK16).
- **Don't sync through JSONL committed to git.** Beads tried it and moved to Dolt
  (PR03–PR05).

## Reference material

### Glossary

| Term | Meaning |
| --- | --- |
| participant | anything that reads or writes: an agent, a person, a service |
| stream | an ordered, append-only sequence of entries with one owner of its order |
| entry | one immutable item in a stream: a message, an event, an answer |
| type | namespaced and defined by consumers, for both streams and entries |
| tag | a namespaced label; one added later arrives as an entry |
| anchor | the entry in a parent stream that a child stream branches from |
| view | a saved filter over entries, such as "distilled" |
| state | a mutable record on a stream or entry, with its transitions logged |
| cursor | a reader's position in a stream (its read or unread boundary) |

Examples of how consumers map onto these terms, not part of the core:

- **SDD:** a *mission* (one request, such as a feature or a bug fix) is an `sdd.mission`
  stream. Its raw ledger is every entry, and its distilled ledger is a view plus the state
  `reconciled`.
- **cyber-truss:** a *workflow* is the creation and propagation of changes across artifact
  sets. *Arbitration* is how workflow agents discuss until they reach consensus. It is a
  `truss.arbitration` child stream, anchored at a `truss.arbitration-needed` entry in the
  mission stream. The members are the electorate, and the answers (`agree`, `disagree`,
  `uncontested/yield`, `request-recess`) are typed entries. The pending answers are state,
  and the decision is written back into the mission stream (LC08).

### Shape

```
stream { id (UUIDv5 from an anchor or key | UUIDv7), handle (+aliases), type, title,
         purpose, members[{participant, role, cursor}], context[refs], parent (anchor entry),
         traits {membership, retention, wake, default view}, state, pinned[], conventions[] }

entry  { id (UUIDv7, writer), stream, seq (owner), author, type, tags[], parent?, root?,
         refs[] (shorthands), body }
```

### Cost to change later

| Decision | Cost to change later |
| --- | --- |
| UUIDv7 entry IDs minted by the writer | **high** |
| `seq` per stream, owner-assigned (arrival order) | **high** |
| Entries immutable; a stream is the unit of partitioning, sync and access control | **high** |
| Stream IDs are UUIDs (v5 derived or v7); handles are separate and can be renamed | **high** |
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

- **High:** the stream-of-entries core, UUIDv7 entry IDs plus owner-assigned `seq`, and
  shared rows plus per-reader state. Several independent systems converge on these, and
  mcp_agent_mail confirms the row split.
- **High:** routing out to the systems of record, and plugin-prefixed conventions. The
  collision was tested directly.
- **High:** SQLite's write transaction as the local order owner on one machine. The load
  test held with up to 32 concurrent writers (LC10).
- **Medium:** the hub technology (NATS or Dolt), and summarization on reconciled streams.

## Strongest supporting evidence

- The convergence on logs: LG04–LG08. The failure of copies in email: LG01–LG03.
- mcp_agent_mail's `messages` plus `message_recipients`: PR10, PR16.
- Slack's re-shard and Discord's snowflake IDs with partitioning by channel: SY21, SY22.
- The cyber-truss arbitration requirements (wake, hold the wait, escalate, write the
  decision to the run record): LC08.
- The reference collision, tested: LC07.

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

- That any existing tool or platform provides the full model (streams, `seq`, cursors, a
  typed ledger, anchors) off the shelf.
- Beads or Dolt as cynapse's backend today.
- That NATS leaf nodes buffer writes durably while offline.

## Where evidence is thin

- `bd compact` and AgentMail's internal storage model (snippet-only, PR08).
- Discord's thread-from-message ID behavior (from memory).
- HY01, the claim that messages stored in a repository hurt agent sessions (one anecdote,
  LC11; not measured).
- GitHub sub-issues (from memory).
- Everything about Reddit (secondary sources only).

## What should be checked again later

- HY01: run the two-copy test in its evidence entry before relying on "messages stay out
  of the repository" as more than a design judgement.
- Dolt as a sync layer that needs no hub, and how it could coexist with owner-assigned
  `seq`.
- Whether cyber-truss arbitration ever spans more than one mission.
- The migration path for universal-plugin's unprefixed reference names.
