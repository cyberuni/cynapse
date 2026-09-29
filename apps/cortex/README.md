# Cortex

Cortex is where the Council, the human, sees and navigates what flows through
cynapse. The cortex is where what crosses the synapses becomes perception.

It is a local web app: a small JSON API that reads a cynapse SQLite database through
the `cynapse` library, and a keyboard-driven UI on top of it. It is read-only apart
from a few Council actions, which are written back as ordinary entries and state changes.

## Run it

```sh
# From the repository root: seed an example database, then start Cortex on it.
pnpm cynapse dev --db /tmp/cynapse.db dev seed --reset
CORTEX_DB=/tmp/cynapse.db pnpm cortex dev      # http://127.0.0.1:5173

# Your own cynapse database: CORTEX_DB defaults to cynapse's own path ($CYNAPSE_HOME/cynapse.db).
pnpm cortex dev
```

`pnpm cortex build && pnpm cortex start` serves the built UI and the API on one port
(`PORT`, default 4173). `pnpm cortex screenshots [url]` captures every view from a
running Cortex with Playwright and the system Chrome.

Cortex reads and writes as the participant `council`, so it is local only. Both servers
listen on 127.0.0.1, and the API refuses a Host other than `127.0.0.1` or `localhost`
on the served port (DNS rebinding), a write that is not `application/json` (a cross-site
form), and a write whose `Origin` is another site.

![Triage](docs/screenshots/triage.png)

More views, captured on the database `cynapse dev seed` produces:
[hierarchy](docs/screenshots/hierarchy.png),
[stream timeline](docs/screenshots/stream-timeline.png),
[provenance](docs/screenshots/provenance.png),
[mission graph](docs/screenshots/mission-graph.png).

## Use cases

What the Council wants to see and do, and where Cortex answers it.

1. **Triage: what needs my hands.** The landing view (`/`, `g t`). It lists every open
   needs-input and escalation addressed to the Council, with the asking entry, the
   question, and the options offered. It lists every arbitration that is still open,
   whose answer is missing, and whether the answers are in but split. It shows unread
   counts per stream, most unread first. `a` answers the selected item in place.
2. **Navigate the work hierarchy.** `/tree` (`g h`) nests streams through their anchors:
   initiative → epic → mission, and a truss mission → its arbitrations. Each row rolls
   up its subtree's unread, needs-input, pending answers, and lifecycle counts.
   `h`/`l` collapse and expand.
3. **Read a stream.** `/s/<handle>`: a timeline of mixed entry types, filtered by type
   and tag chips. `v` toggles raw and distilled for streams with a `distilled` view (a
   reconciled stream opens distilled). `t` shows the reply tree. `m` shows cynapse's own
   meta entries. An anchor entry opens its child stream inline (`o`) or side by side
   (`s`, close with `x`). The side panel shows members, open state, pins, and children.
4. **Follow a decision's provenance.** `/p/<handle>/<seq>` (`p` on a decision): the
   decision, the anchor that asked for it, the arbitration transcript, the contributions
   the anchor and answers reference, and the rulings that followed.
5. **The mission graph.** `/g/<handle>` (`g g`): the DAG from an `sdd.mission-graph`
   stream, colored by ready, claimed, retired, blocked, and tombstoned, with why each
   node is ready or held. `[` `]` step through its history one graph entry at a time,
   and each step has its own URL (`?at=<seq>`).
6. **Search across streams** by type and tag (`/search`, `/` or `g s`): for example
   `type:truss.decision type:sdd.decision` for all decisions, or `topic:auth`.
7. **Members and waiting.** The stream side panel lists members with their role, cursor
   (`@seq`), and unread count, and who is waiting on whom: an asker on the Council, or an
   arbitration on the electors whose answers are missing.
8. **References and deep links.** Reference shorthands render as links: `gh:` issues,
   commits, branches, and repos, `npm:`, `asana:`, and plain URLs go out, and
   `handle#seq` opens the entry in Cortex. Every view has a URL, and every entry is
   `/s/<handle>#<seq>`; the URL follows the selection.
9. **Council actions,** written through the store as ordinary entries and state changes:
   - mark a stream read (`r`) — moves the Council's cursor;
   - answer a needs-input or escalation (`a`) — appends `council.answer` as a reply to
     the asking entry, with the chosen option in its payload, and resolves the record;
   - ratify or override a decision (`R` / `O`) — appends a ratify or override
     entry in the decision's namespace (`truss.ratify` for a `truss.decision`,
     `sdd.override` for an `sdd.decision`) as a reply to the decision.
10. **Keyboard throughout.** `j`/`k` move, `Enter` opens, `u` goes up to the parent
    stream, `Backspace` goes back, and `?` lists every key.

**Robot mode.** Every view the Council sees is also JSON an agent can read, for example
`curl 127.0.0.1:5173/api/triage`. The endpoints are in `src/server/api.ts`.

## Layout

```
src/core/     pure derivations over a Store: triage, hierarchy, graph, provenance, members, refs, actions
src/server/   the Hono API, the store choice, and the production server
src/web/      the React UI: routes, keymap, views
scripts/      screenshot capture
```

`src/core/model.ts` names the part of the cynapse `Store` that Cortex uses. The core
derivations are unit-tested against an in-memory store (`memory-store.ts`) holding a
small world shaped like cynapse's seed (`fixture.ts`); `src/server/store.test.ts` runs the
API on the real library over a database `seed()` produced.
