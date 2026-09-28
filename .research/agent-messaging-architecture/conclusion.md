# Conversation architecture for agent messaging — Conclusion

## Last updated

September 2026

## Question

1. How do Slack, Discord, Telegram, and Reddit structure channels and DMs? Is the only
   difference between a channel and a DM its name and the way you find it?
2. How well do these human chat models fit communication between agents?
3. Should cynapse group conversations by workspace or project?
4. Should cynapse build its own store, or support existing systems as backends the way
   cyber-mux does? The candidates are Slack, Discord, Telegram, Linear, Asana, GitHub, a
   git orphan branch, and a database.

## Verdict

**1. A channel and a DM differ in more than name and discovery.** Production platforms
share the *message plane*: storage keyed by conversation ID (Discord, SD11), the same
transport (Slack, SD06), and one conversation object (Slack, SD01, SD03). They split the
*conversation plane* by kind:

- **Identity:** a channel has a name, while a DM is keyed by its set of participants (SD02).
- **Membership:** channels are open and join-based; DMs are fixed and small, capped at
  9–10 people (SD07, SD13).
- **Authority:** channels have roles and permission overrides; in a DM the only rule is
  whether you are a participant (SD09, SD10).
- **Sequencing:** Telegram gives each channel its own sequence and keeps one shared
  sequence per account for DMs (TR03, TR04).
- **Lifecycle:** Slack closes a DM but archives a channel (SD04).

Reddit's separate systems are the counterexample, and its 2023 chat migration cut off
the pre-2023 history (TR12–TR16).

**2. For agents, mail fits well, channels fit only in a narrower role, and DMs are barely
needed.**

- **Mail.** Every agent system surveyed converges on addressed, durable messages that are
  pulled and acknowledged: A2A, mcp_agent_mail, and Claude Code's SendMessage (AG01–AG04).
  Mail is cynapse's core.
- **Channels.** As a place where agents *converse*, channels are the documented failure
  mode. Group chat needs arbitration over whose turn it is (AutoGen, AG06). Unbounded
  multi-agent chat accounts for most of the infinite-loop failures studied (AG12), and
  coordination failures make up 79% of multi-agent failures (AG11). Telegram blocks
  bot-to-bot visibility for exactly this reason (BK09). Channels still work as
  **broadcast streams** (status, events, announcements), where reading creates no
  obligation to reply and each reader keeps a cursor to control its token budget.
- **DMs.** No agent system has DMs as a separate concept. The need is covered by a
  **task or context reference** on messages, such as A2A's `contextId` (AG01) or Agent
  Teams' shared task list (AG05). A thread ID on mail is enough.

**3. Scope only channels by project. Identity, mail, and DMs stay global.** Discord keeps
DMs outside guilds (AG15), and Slack Enterprise Grid scopes DMs to the whole organization
(AG13). GitHub keeps identity global and adds membership on top (AG19). mcp_agent_mail
keys a project by its repo path (AG20). Multi-homing (Asana tasks, Linear projects:
AG17, AG18) is not needed at first.

**4. Build a cynapse-owned store behind an internal storage interface. Do not follow
cyber-mux's pluggable-backend model. Treat external platforms as optional mirrors, not
backends.** Every external platform lacks something cynapse needs at its core:

- None of them natively supports ack/consume, per-reader cursors, or DMs keyed by
  participant set.
- Telegram cannot deliver messages between bots at all (BK09).
- Discord needs a persistent Gateway socket and a privileged intent (BK07, BK08).
- Rate ceilings are lower than an agent burst: Linear allows 2,500 requests per hour
  (BK12) and GitHub 80 content-creating requests per minute (BK16).
- Bridges built on the lowest common denominator, such as Matterbridge and Apprise,
  lose threading and structure (BK27, BK28).

## Reference material

### Why cyber-mux's pattern does not transfer

cyber-mux adapts to 7 multiplexers (tmux, wezterm, zellij, and others). The user has
already chosen one, the panes live inside it, and cyber-mux must drive whatever is there.
Capability flags make it refuse operations a backend cannot do. An unsupported floating
pane throws an error; it does not degrade quietly. For cynapse, no messaging substrate is
chosen in advance, and the operations missing on the candidate platforms are the core
ones (ack, cursor, bot-to-bot delivery). Under cyber-mux's refuse-on-missing rule,
Telegram would refuse mail outright, and Slack or Linear would refuse ack and cursors.
The pattern that does transfer is cyberlegion's own `Store` interface, whose code already
names `SqliteStore` as the sanctioned replacement.

### Backend fit

| Backend | Rate ceiling | Bot-to-bot | Ack/cursor | Local/offline | Role for cynapse |
| --- | --- | --- | --- | --- | --- |
| SQLite (WAL) | local I/O | yes | native in the schema | yes, single host only (BK24) | **v1 store** |
| Files (cyberlegion today) | local I/O | yes | rename to ack; no cursors | yes | mail only; outgrown by channels |
| Git orphan branch / notes | CAS contention (BK22) | yes | buildable (git-bug op-log, BK19) | yes, and syncs across machines | **candidate for a later sync layer** |
| Slack | ~1 msg/s per channel (BK01) | undocumented (BK03) | none | no | outbound mirror for humans |
| Linear / Asana | 2,500/hr; 150–1,500/min (BK12, BK14) | n/a | none | no | link messages to issues, not a store |
| GitHub | 80 creates/min, 500/hr (BK16) | yes | none | no | mirror or link |
| Discord | Gateway socket required (BK07) | intent-gated (BK08) | none | no | skip |
| Telegram | 20/min per group (BK10) | **blocked** (BK09) | offset only | no | skip |

### Proposed shape for cynapse

| Concern | Recommendation | Cost to change later |
| --- | --- | --- |
| Participant identity | global to the install; project membership added on top | **high**, because addresses get handed out |
| Mail | per-recipient delivery rows, consumed by ack; thread and context reference on each message | **high**, as the core contract |
| Channels | broadcast only, per-reader cursor, no reply obligation; a mention sends mail or rings the doorbell | medium |
| Channel scope | namespaced by project, plus global channels | medium, if names are namespaced from the start |
| Project key | the git common directory or remote, **not** the worktree path | low to medium |
| DMs | deferred; mail threads cover the need | low; can be added later as a kind |
| Store | SQLite behind a `Store` interface | low, if the interface holds |
| Human visibility | outbound mirror adapters (Slack, GitHub) | low |
| Multi-machine | git-backed sync layer, evaluated when needed | low for now |

On the project key: mcp_agent_mail keys a project by its absolute path (AG20). Under
cyberfleet worktrees, that would split one repo into many projects. Keying by the git
common directory keeps all worktrees in one project.

## Confidence

- **High** that channels and DMs differ structurally (primary API docs for three
  platforms).
- **High** that external platforms cannot be the system of record. The hard blockers
  (Telegram bot-to-bot, the rate ceilings) were each re-fetched and confirmed.
- **Medium** that channels should be broadcast-only for agents. The failure research
  supports it, but most frameworks were checked through their docs rather than run.
- **Medium** that DMs should be deferred. This is a design judgment, not a finding.

## Strongest supporting evidence

- Slack's type-gated methods over one object; Discord's type-exclusive fields and its
  single message table (SD01–SD04, SD09–SD11).
- Agent systems converging on addressed mail plus task objects (AG01–AG05).
- Telegram's documented bot-to-bot block, given to avoid loops; the loop and coordination
  failure statistics (BK09, AG11, AG12).
- The rate limits and missing ack/cursor support across the external platforms
  (BK12, BK14, BK16).

## Strongest weakening or contradictory evidence

- Letta and AutoGen do run shared-thread conversation among agents (AG06, AG08). They
  work, but they need arbitration, so channel-style conversation is not impossible.
- Linear has a first-class agent actor model (BK13). Human-facing work tracking is
  moving toward agents, so Linear as a *participant surface* may matter more later.
- Git-backed stores give multi-machine sync for free (BK19–BK22), and SQLite
  specifically does not (BK24). If multi-machine use comes early, the store choice
  changes.

## What is not supported

- The claim that Reddit chat runs on Matrix.
- That any external platform supports ack/consume semantics natively.
- A named "blackboard pattern" citation in the agent frameworks. That framing is ours.

## Where evidence is thin

- All Reddit evidence is secondary.
- Notification defaults on every platform (memory only, SD14).
- Claude Code Agent Teams (AG05), CrewAI, and LangGraph were checked through search
  snippets only.
- Whether Slack bots can see each other's messages (BK03, low confidence).
- The maildir mechanics (BK26, from memory).
- The Magentic-One failure statistics (AG09, AG10, aggregated sources).

## What should be checked again later

- The Agent Teams mailbox and task-list docs, fetched directly.
- Whether cynapse should carry an A2A-compatible `contextId` or task reference, for
  interop.
- Slack bot-to-bot visibility, by direct test, if a Slack mirror becomes two-way.
- The git-backed sync design, once multi-machine use is on the roadmap.
