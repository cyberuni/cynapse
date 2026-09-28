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
