---
title: Refs
description: Render reference shorthands such as gh:cyberuni/cynapse#12 as links — the cynapse/refs export.
---

cynapse does not call GitHub, Asana or npm. When an entry or channel points at something in another
system it stores a short, stable string — a *reference shorthand* such as `gh:cyberuni/cynapse#12` — and
turns it into a link only when something renders it. `renderRef` is that renderer.

```ts
import { renderRef, type RenderedRef } from 'cynapse/refs'
```

`cynapse/refs` is its own entry point and imports nothing, so a browser bundle can render references
without pulling in `node:sqlite`. `renderRef` and `RenderedRef` are also re-exported from `cynapse`
itself, for code that already depends on the whole package.

## `renderRef(ref)` → `RenderedRef`

```ts
interface RenderedRef {
  ref: string        // the input, unchanged
  url?: string       // absent for a reference with no web address
  markdown: string   // a link, or the reference in backticks when there is no url
}
```

A reference that does not parse, or has an unknown scheme, is never an error: it comes back with no
`url` and `markdown` set to the reference in backticks.

| Shorthand | `url` |
| --- | --- |
| `gh:owner/repo#12` | `https://github.com/owner/repo/issues/12` |
| `gh:owner/repo@0c173b2` | `https://github.com/owner/repo/commit/0c173b2` (7 to 40 hex digits) |
| `gh:owner/repo:feat/x` | `https://github.com/owner/repo/tree/feat/x` |
| `gh:owner/repo` | `https://github.com/owner/repo` |
| `npm:cynapse` | `https://www.npmjs.com/package/cynapse` |
| `asana:1234567890` | `https://app.asana.com/0/0/1234567890` (digits only) |
| `https://example.com/a` | itself; `markdown` is `<https://example.com/a>` |
| `truss-auth#4` (an internal `handle#seq`) | none |
| `jira:ABC-1` (unknown scheme) | none |

```ts
renderRef('gh:cyberuni/cynapse#12')
// {
//   ref: 'gh:cyberuni/cynapse#12',
//   url: 'https://github.com/cyberuni/cynapse/issues/12',
//   markdown: '[cyberuni/cynapse#12](https://github.com/cyberuni/cynapse/issues/12)',
// }

renderRef('truss-auth#4')
// { ref: 'truss-auth#4', markdown: '`truss-auth#4`' }
```

A GitHub issue and a pull request share the `#12` form and both render with an `/issues/` URL, which
GitHub redirects to the pull request when that is what the number is.

## Where references appear

Channel `context`, an entry's `refs` and [`--ref`](/cynapse/cli/entry/#cynapse-entry-append) all hold
shorthands as written. The CLI renders them as links in `channel show` and `entry show`
(the latter adds a `links` array under `--json`).

The schemes above are all there is today; there is no way to register more. See also
[Agent-friendly output](/cynapse/concepts/agent-friendly-output/).
