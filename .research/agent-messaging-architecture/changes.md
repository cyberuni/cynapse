# Changes

## 2026-09-27

- What changed: first draft covering Slack, Discord, Telegram, and Reddit.
- Why: to inform how cynapse models channels and DMs.
- Conclusion changed materially: n/a (initial).
- Triggered by: SD01–SD14 and TR01–TR16.

## 2026-09-27 (round 2)

- What changed: scope widened to how well each model fits agent communication, how
  conversations are scoped to workspaces and projects, and the choice of backend (Linear,
  Asana, GitHub, git orphan branch, database, plus the chat platforms). Added AG01–AG20
  and BK01–BK30, and a local survey of cyber-mux's adapters and cyberlegion's mail store.
- Why: the user asked whether cynapse should build its own store or adapt to backends,
  like cyber-mux does.
- Conclusion changed materially: yes. It now recommends broadcast-only channels,
  deferring DMs, project scope for channels only, and an owned SQLite store with external
  platforms as mirrors.
- Triggered by: AG11, AG12, BK09, BK12, BK16, AG20. BK09, BK12, and BK16 were re-verified
  directly.

## 2026-09-27 (round 3)

- What changed: added the choice of underlying structure (per-recipient copies or a log
  per conversation), multi-machine and enterprise sync, and a survey of agent
  collaboration use cases. Added LG01–LG22 and SY01–SY23, plus local evidence LC01–LC03
  (the cyber-truss run ledger, SDD's sharded ledger, the cyberlegion store and cyber-mux).
- Why: the user asked for the right structure to start with, across scales from solo to
  enterprise, and for how mission ledgers and cyber-truss would consume it.
- Conclusion changed materially: yes. The conversation log becomes the core primitive,
  and mail becomes addressed entries plus inbox pointers. DMs are no longer deferred (they
  are two-party conversations); only DM deduplication is. Adds single-owner `seq` with
  writer-minted IDs, the conversation as the partition unit, and state records for
  leases, presence, and approvals.
- Triggered by: LG01–LG08, LG17, LG18, SY08, SY21, SY22, LC01, LC02.

## 2026-09-28 (round 4): scope

- What changed: cynapse is the communication layer. It owns only communication with no home
  elsewhere, such as ledgers, discussions between agents, coordination, change feeds, leases
  and presence, and read state. Everything else routes to the service of choice (GitHub,
  Asana, Linear), which agents call directly. "Mail" is dropped as the organizing concept, and
  so are provider adapters inside cynapse.
- Why: the user corrected two overcorrections, first cynapse storing everything, then
  cynapse storing nothing and indexing everything.
- Conclusion changed materially: yes.
- Triggered by: user direction; LC04 (GitHub notifications), LC05 (CloudEvents dataref).

## 2026-09-28 (round 5): how the system is used

- What changed: added routes, conventions, and stamps. `init-cynapse` is setup that is safe
  to re-run, writing `.agents/cynapse.json`, an AGENTS.md block, and convention overlays.
  Conventions are references fetched once per session, with IDs filled in at setup; the
  separate runtime binding call is dropped. Each service plugin owns its own conventions.
  Convention names carry a plugin prefix.
- Why: the user wants unambiguous, customizable usage conventions pushed into deterministic
  code, at one call per message type.
- Conclusion changed materially: yes.
- Triggered by: LC06, LC07; buddy-agent-harness#193.

## 2026-09-29 (round 6): identity and structure

- What changed: entry IDs are UUIDv7 (the standard, sortable by time), and `seq` is kept for
  arrival order, gap detection, and `handle#seq` short references. Streams get UUID identity
  (v5 from an anchor or natural key, otherwise v7) plus handles that can be renamed. Entries
  form a `parent`/`root` reply tree. Namespaced types and tags; a tag added later arrives as
  a label entry. Stream types are defined by consumers on top of generic traits. Child
  streams attach through an anchor entry. Cleanup is a lifecycle state (`reconciled`) over a
  distilled view, not a deletion.
- Why: user questions on ULID versus UUIDv7, on dropping `seq`, on threading, on tags, on
  stream IDs, and on distilled ledgers.
- Conclusion changed materially: yes.
- Triggered by: user direction; LG11, LG13.

## 2026-09-29 (round 7): terms and domain neutrality

- What changed: a glossary (participant, stream, entry, type, tag, anchor, view, state,
  cursor). mission, workflow, and arbitration become examples, not core concepts. Definitions
  corrected: a mission is one request (a feature or bug fix); a workflow is the propagation
  of changes through artifact sets; arbitration is how workflow agents reach consensus, as a
  child stream of one mission. The neural metaphor is kept for the brand only. Stream
  metadata is an agent's briefing in one call.
- Why: user clarification and requests.
- Conclusion changed materially: yes, the terminology.
- Triggered by: LC08.

## 2026-09-29 (round 8): comparison with beads and agent mail

- What changed: confirmed shared entry rows plus per-reader state (mcp_agent_mail). Added:
  stock SQLite only, with the write transaction as the local order owner and no daemon; a
  load test with 10 or more writers; `root` on entries; `handle#seq` short references,
  because UUIDv7 prefixes collide; read flags for the context budget; mcp_agent_mail's lease
  design; Dolt as a candidate for sync with no hub. Rejected beads and Dolt as backends
  today; beads is a routing destination.
- Why: the user asked for a structural and performance comparison with beads and agent mail,
  and whether to use Dolt or beads as the backend.
- Conclusion changed materially: yes, the additions above.
- Triggered by: PR03-PR05, PR10, PR12-PR14, PR16, LC09.

## 2026-09-30 (round 9): messages stay out of the repository

- What changed: added "messages stay out of the repository" to the store verdict. Raw
  conversation lives in the database outside any repository, and only distilled artifacts
  reach it. Recorded the Council's hypothesis HY01 with a two-copy test. Recorded the PR #16
  load test (LC10) and raised confidence in SQLite as the local order owner to high.
- Why: the Council raised the hypothesis that Markdown messages in a repository cost agents
  context and cause confusion. The prototype produced the load-test numbers.
- Conclusion changed materially: yes (a new verdict line, and higher confidence).
- Triggered by: HY01, LC10, LC11.

## 2026-10-03 (round 10): stream becomes channel

- What changed: the core primitive is called a channel, not a stream (ADR-0009). Only the
  term changes; the model does not.
- Why: the user pointed out that "stream" suggests one-way flow between two endpoints,
  while a cynapse channel has many participants writing in both directions.
- Conclusion changed materially: no (terminology only).
- Triggered by: user direction; LG15.

## 2026-10-03 (round 11): a network of subjects across stores

- What changed: proposed ADR-0010 to ADR-0012. The structure follows DNA (Datum Network
  Architecture): subjects live in their own stores, relations are metadata on both ends,
  hierarchy is a view, and consumers attach perceived types. cynapse stores only what no
  other store can, and guides and composes rather than fetching or caching. Channels are
  keyed by subject, using the store's stable native ID, and come in two kinds (address and
  work). DMs are dropped.
- Why: the user framed communication as address channels and work channels, asked how
  issues, PRs and split issues relate, and pointed out that DNA is an architecture that any
  store able to carry metadata can implement.
- Conclusion changed materially: yes. The ADRs were accepted the same day. Also added
  the one-call guidance goal (LC13), alias keys for moved subjects (LC12), write-back
  triggers, and how a stalled arbitration escalates.
- Triggered by: user direction; DNA design notes.
