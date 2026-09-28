# Conversation architecture for agent messaging — Conclusion

## Last updated

September 2026 (round 3)

## Question

1. How do Slack, Discord, Telegram, and Reddit structure channels and DMs? Is the only
   difference between a channel and a DM its name and the way you find it?
2. How well do these human chat models fit communication between agents?
3. Should cynapse group conversations by workspace or project?
4. Should cynapse own its store, or adapt to existing backends the way cyber-mux does?
5. Which underlying structure should cynapse start with: per-recipient copies (mail with
   a thread ID), or one log per conversation? The structure has to support humans
   inspecting conversations and decisions, mission ledgers, and change detection
   (cyber-truss). It also has to scale from a solo developer to an enterprise with
   thousands of projects and tens of thousands of employees.
6. How should sync work across multiple machines?
7. Which other agent collaboration use cases should shape the design?

## Verdict

### The core primitive: one append-only log per conversation

Everything in cynapse is an **entry** in a **conversation log**. Mail, channels, DMs, and
mission ledgers are conversations. They differ in their membership rules, in how
addressed entries are delivered, and in how reading counts as consuming. Their storage
is the same.

Per-recipient copies are the structure to avoid. Email shows the failure. Its threading
reconstructs a conversation from copies and has to invent placeholder messages for
missing parents. Threads break when headers are missing or wrong (LG01, RFC 5256), and
even Gmail mis-groups messages (LG03). Copies have no single order, a participant added
later cannot see the earlier history, and anyone inspecting a thread has to rebuild it.
Every system that scaled past this converged on one log per conversation with a cursor
per reader: Slack (LG04), Discord across two storage migrations (LG05), Telegram's
per-box `pts` (LG07), Matrix rooms (LG11), and Kafka partitions (LG08). cyberlegion's
current mail is per-recipient copies (LC03). cyber-truss's run ledger is already a log
with entries addressed to recipients (LC01).

### Mail and channels differ in delivery, not storage

- **Channel or ledger:** each reader has a cursor, which is the last `seq` it read.
  Reading consumes nothing.
- **Mail:** an entry carries `to:` addressees. Writing it also appends a pointer to each
  addressee's **inbox**, a per-participant index that has its own sequence. This is
  Telegram's per-account "common message box" (TR03). Acks are recorded per inbox item
  and can happen out of order, which a single Kafka-style offset cannot express.
- **Fan-out** is paid on write only for the entries addressed to someone, and only for
  those addressees. Posting to a large channel writes one row, and a mention writes one
  inbox pointer. This is the hybrid model Twitter uses for accounts with huge
  followings (LG06, LG20). It is what keeps the model workable at enterprise scale.
- **DMs** need no separate structure. A two-party mail thread *is* a DM. This revises
  round 2's "defer DMs": the only deferrable part is the identity rule that deduplicates
  a DM by its participant set.

### Messages and structured events share one log

A mission ledger mixes conversation with typed events: decisions, gate verdicts,
contributions, and state transitions. Matrix (state events versus message events, LG11),
GitHub's issue timeline (LG13), and Zulip topics (LG15) all interleave the two in one
ordered stream. GitHub only *infers* decisions from state changes. A first-class
`decision` entry type, shaped like an ADR (LG14), is where cynapse can do better, and it
is what makes decisions inspectable. Entry types are namespaced and open-ended
(`truss.contribution`, `sdd.gate`), so other tools can extend them without a cynapse
release.

### Nested work links; it does not nest

Initiative, epic, and story are metadata. The structure is a parent link on the child
conversation plus a `child-opened` event in the parent's log. A rollup is computed on
read, not inlined into the parent (Linear, LG16). cynapse does not need to know what an
"epic" is. SDD missions are flat change requests anyway.

### Some needs are state, not log

Leases (file and worktree reservations), presence, pending approvals, and the live
status of a task depend on what is true *now*. They need expiry (TTL) and mutual
exclusion, which a log cannot enforce. mcp_agent_mail (LG18) and A2A (LG17)
independently chose a **state record with enforced transitions** and log only the
*history* of those transitions. cynapse should do the same: logs are the source of
truth, and state records are companions whose every transition is also written to the
log.

### Ordering: a per-conversation owner assigns `seq`; the writer mints `id`

Each entry has two identities:

- `id`: a ULID or UUIDv7 minted by the writer, even while offline. It serves as the
  idempotency key and as the entry's stable global identity.
- `seq`: assigned by the conversation's **home**, its single ordering owner. It gives
  the canonical order that cursors and inspection rely on.

An offline writer appends entries marked pending. The home sequences them when it next
syncs. This is the single-owner family (LiteFS, JetStream, Telegram `pts`: SY02, SY08),
not leaderless merge (git-bug, CRDTs, Matrix state resolution: SY03, SY07, SY17), which
gives only causal order.

SDD's sharded ledger shows the cost of going leaderless. Sharding by writer removed the
merge conflicts, and in exchange "neither `seq` nor `ts` is load-bearing" (LC02). That is
acceptable for existence checks and wrong for a decision ledger people read in order.

### Partition, sync, and access control all work per conversation

The conversation is the unit of partitioning, sync, and permissions. Discord partitions
by channel and time bucket (SY22). Slack paid for a costly re-shard away from
per-workspace sharding (SY21). Access that is granted per conversation is also why a
git-backed store does not work at enterprise scale, because git access control is per
repo (SY07).

### Topology by tier: one data model, a store that swaps

| Tier | Store / transport | Where each conversation's home lives |
| --- | --- | --- |
| Solo | SQLite (WAL), embedded, zero setup | this machine |
| Multi-machine (laptop, VM, CI) | local SQLite replica plus a hub; outbound-only connections | the hub, or a laptop while offline |
| Team | hub server (cynapse's own, or NATS JetStream underneath) | the hub |
| Enterprise | a hub cluster with tenancy (NATS accounts, SY10), placing conversations by ID | sharded by conversation |
| Across organizations | federation (Matrix-style) or bridges | per organization; defer |

The data model maps directly onto NATS JetStream: a stream is a conversation, the stream
sequence is `seq`, a durable consumer is a cursor, and an inbox is a per-participant
stream of pointers (SY08–SY10). Keep that mapping available. Don't adopt NATS yet.
Embedding a Go server in an npm CLI is heavy, and how a leaf node buffers messages
offline is unverified.

## Reference material

### Entry shape (proposed)

```
entry {
  id            ULID or UUIDv7, minted by the writer (idempotency key, global identity)
  conversation  conversation ID (the partition and sync unit)
  seq           per-conversation, assigned by the home (null while pending)
  author        participant address (global identity)
  type          namespaced: msg | decision | event.* | truss.* | sdd.* ...
  to?           addressees (participants, roles, or sets) -> inbox pointers
  refs?         reply-to, supersedes, context/mission, parent conversation
  body          text and/or a structured payload
  at            writer's hybrid logical clock timestamp (display only; not the order)
}
```

Entries are immutable. An edit or retraction is a new entry with `supersedes`.

### Cost to change later

| Decision | Cost to change later |
| --- | --- |
| Entry `id` is a writer-minted ULID or UUIDv7, never an autoincrement | **high**: every reference and cursor depends on it |
| `seq` is per conversation and assigned by one home | **high**: cursors and ack semantics depend on it |
| The conversation is the unit of partition, sync, and access control | **high**: Slack's re-shard (SY21) |
| Entries are immutable; edits supersede | **high**: audit and sync rely on it |
| Addressed entries plus inbox pointers, rather than per-recipient copies | **high**: this is the core structure |
| Namespaced, open entry types | medium |
| Conversations namespaced by tenant and project | medium: a namespace is easy to add at the start |
| Parent links for hierarchy | low |
| DM deduplication by participant set | low |
| Storage engine (SQLite first) and sync transport (hub, NATS) | low, behind the `Store` interface |

### Agent collaboration use cases

| Use case | Primitive | Notes |
| --- | --- | --- |
| Mission ledger (initiative, epic, story) | log, `decision` entries | the case you proposed; the parent links to children |
| cyber-truss run ledger | log, entries addressed to sets | a controller reads "addressed to me", and cyber-truss decides when to act (LC01) |
| Change feeds (main moved, spec changed, CI failed) | log plus cursors | how a change entering anywhere reaches the connected sets |
| Work claiming (addressed to a role such as "a reviewer") | log plus a **shared** cursor | competing consumers, as in cyberlegion role dispatch |
| Request, response, and handoff | log with `refs` correlation | a timeout needs a watcher; see state records |
| Human approval and needs-input | log plus a pending-state record | "currently pending" is state (A2A, LG17) |
| Leases on files and worktrees | **state record** with TTL and compare-and-swap; transitions logged | mcp_agent_mail (LG18); matters for cyberfleet worktrees |
| Presence and liveness | **state record** (last heartbeat plus staleness) | no primary prior art found |
| Decision memory ("what did we decide about X") | log plus a derived query index | event sourcing and CQRS (LG09, LG10) |
| Audit and provenance | the log itself | immutability plus a total order |
| **Checkpoint and summary entries** | log entry of type `summary` covering `seq ≤ n` | agent-specific: a late joiner or a restarted session starts from a checkpoint instead of `seq` 0, which protects its token budget. This is our proposal; no prior art was fetched. |
| Session resume after restart | cursor plus a checkpoint | durable cursors outlive sessions |

## Confidence

- **High:** a log per conversation beats per-recipient copies for ordering, inspection,
  late joiners, and scale. This is convergent evidence across Slack, Discord, Telegram,
  Matrix, and Kafka, and email is the documented failure case.
- **High:** globally unique IDs and the conversation as the partition unit are the
  decisions to make now. Discord and Slack are direct precedents.
- **Medium-high:** single-owner ordering, as opposed to leaderless merge. The precedents
  are strong. The offline pending-entry handoff is our design and has not been proven in
  a system of this shape.
- **Medium:** NATS JetStream as a later transport. The model fits, but offline buffering
  and scale at enterprise tenancy are unverified.
- **Medium:** checkpoint and summary entries. This is reasoning, not a sourced finding.

## Strongest supporting evidence

- Email threading's documented fragility (LG01–LG03) against the channel-log storage of
  Slack, Discord, Telegram, and Matrix (LG04, LG05, LG07, LG11).
- Kafka consumer groups: one log serves both competing consumers and independent readers
  (LG08).
- cyber-truss's run ledger already has the shape of an addressed log (LC01).
- Discord's Snowflake IDs and its channel partitioning; Slack's re-shard away from
  per-workspace (SY21, SY22).

## Strongest weakening or contradictory evidence

- SDD found that a per-writer, order-free ledger was *enough* for its readers (LC02).
  Canonical order is not free, and some consumers do not need it.
- Leaderless merge (git-bug, Matrix) handles true peer-to-peer offline work, which the
  single-owner model cannot while the home is unreachable (SY07, SY17).
- Per-recipient ack sets add a second index on top of the log. That write cost is real
  and grows with the number of addressees.
- Matrix is the only surveyed system that federates across organizations, and it does so
  *without* a total order (SY17). If federation across organizations matters, the
  single-owner model needs a federation story.

## What is not supported

- That any existing platform or sync engine gives cynapse's full model (log, cursors,
  per-recipient ack, a typed ledger) off the shelf.
- That NATS leaf nodes buffer writes durably while disconnected (unverified, SY09).
- That Reddit chat runs on Matrix.

## Where evidence is thin

- The Twitter fan-out, Kreps's *The Log*, jwz threading, and Kafka ordering came through
  secondary sources or snippets (LG02, LG06, LG19, SY12).
- NATS at enterprise tenancy scale; Turso's offline conflict model; the maturity of
  Dendrite and Conduit (SY04, SY19).
- Presence prior art.
- How Slack and Discord store read state for each user.
- Round-2 thin spots still stand: Reddit, notification defaults, Agent Teams.

## What should be checked again later

- NATS JetStream domains for leaf nodes: whether offline writes survive and replay.
- Whether cyber-truss's run ledger design settles on addressed contributions. If it
  does, it becomes cynapse's first external entry-type namespace.
- Whether SDD's ledger should move onto cynapse conversations once they exist.
- The federation story, if collaboration across organizations enters scope.
