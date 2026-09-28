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
