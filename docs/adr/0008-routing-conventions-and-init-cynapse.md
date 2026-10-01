# ADR-0008: Routing kinds, prefixed conventions, and `init-cynapse`

## Status

Accepted, 2026-09-30. Not built yet.

## Context

Because cynapse owns only communication with no other home
([ADR-0002](0002-own-only-communication-with-no-other-home.md)), each project has to say
where everything else goes, and agents need exact instructions for writing there without
ambiguity. That covers issue formats, how to leave a message, the Asana hierarchy, and
custom field names and IDs. Those choices differ between organizations, so they must be
customizable, and they should cost one call to load, not one per message.

## Decision

- **Routing kinds cover only what leaves cynapse:** `work-item`, `code-review`,
  `discussion`, and `decision-record`. Consumers may add namespaced kinds (`x.incident`).
  What cynapse owns (ledgers, arbitration, coordination, change feeds) is a stream type,
  not a routing kind. Initiatives, epics, and stories are levels inside `work-item`, mapped
  by each service's convention.
- **Conventions are references,** fetched with buddy-agent-harness `reference show` once per
  session. Each service's plugin owns its own (`cyber-asana.work-item`,
  `repobuddy.code-review`). cynapse owns only its own conventions and the routing skill.
- **Reference names carry a plugin prefix,** because a project copy of a bare name silently
  overrides every plugin's copy (LC07, buddy-agent-harness#193).
- **`init-cynapse` owns setup, and is safe to re-run.** Each run reads the current state,
  shows it, asks only about what is missing or changing, then writes three things:
  - `.agents/cynapse.json`: the routes, where each convention came from, and the kinds not
    yet set up;
  - a block between markers in AGENTS.md, rewritten on each run;
  - project-tier convention overlays (`merge: merge-sections`) with IDs filled in.

  It delegates the IDs to the service's own init skill. Deterministic steps are CLI
  commands (`cynapse setup status|route|materialize|agents-md`).
- **Stamps:** a ledger write returns a stamp to paste into the post. That is an HTML
  comment on GitHub or a trailer line on Asana, and it makes the post machine-readable,
  guards against a duplicate post, and links back to the ledger.

## Considered options

- **A separate lookup for bindings at runtime.** Rejected. It costs an extra call per
  message. IDs are filled in at setup instead.
- **cynapse shipping every service's conventions.** Rejected. cynapse would become a
  monolith, and each convention would drift from the plugin that knows the API.
- **cynapse wrapping `gh` and other CLIs.** Rejected. It adds a lagging layer over tools
  agents already use correctly.

## Consequences

- Kind names become keys in `.agents/cynapse.json` and in reference names, so renaming one
  is a migration. Keep the list short.
- IDs filled in at setup can go stale. `cynapse setup status` doubles as the check.

## Related

- Evidence: LC06, LC07.
- Research round 5 in `changes.md`.
