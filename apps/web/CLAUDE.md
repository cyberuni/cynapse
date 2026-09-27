# AGENTS.md

Guidance for the docs site. The repo-wide rules in the root `AGENTS.md` still apply.

## What This Is

`@cyberuni/web` — the Astro + Starlight documentation site, deployed to GitHub Pages.
`base` is `/cynet`, so the dev server serves pages under that prefix too
(`http://localhost:4321/cynet/...`), not at the root.

## Commands

```
pnpm web dev      # run the site locally
pnpm web build    # production build; catches MDX and content-collection errors
pnpm web test     # vitest over src/**/*.test.ts
```

## Moving a Page

**A page move is a content review, not a `git mv`.** A page's text is written against its
neighbours — what it can assume the reader has seen, what it points at, what it may safely
restate. Change the neighbours and some of that text becomes wrong while every link still
resolves. Do the review before pushing, and commit it separately from the move so the move
stays revertable.

Work the list in order:

1. **Inbound links.** `grep -rn "<old/path>" . --exclude-dir=node_modules --exclude-dir=dist
   --exclude-dir=.git`. Catch `readme.md` and any absolute `https://cyberuni.github.io/...`
   URL, not just site-relative ones. There is no redirect layer — the old URL dies.
2. **Sidebar.** Update `astro.config.mjs`. An `autogenerate` entry left pointing at a now
   empty directory, and a section reduced to a single item, are both dead weight; a section
   with one member should become a top-level link.
3. **Cross-references.** A page that was "elsewhere" is now a sibling. Prose written as
   *"this is argued over in X"* reads as a pointer away from a section the reader is already
   inside. Reword as a handoff.
4. **Duplication.** Restating a claim is tolerable across distant sections and reads as a
   repeat when the pages sit three rows apart. Grep the moved page's key sentences and
   blockquotes against its new neighbours, and decide which page **owns** each claim; the
   others cite it.
5. **Labels.** Check the new neighbours for near-duplicate sidebar entries.
6. **Anchors.** If the review deleted or renamed a heading, grep for `#the-old-heading-slug`.

Then `pnpm web build` and crawl the output, since Starlight does not fail a build over a
dead internal link:

```sh
cd dist && for f in $(find . -name '*.html'); do grep -o 'href="/cynet/[a-z0-9/-]*"' $f; done \
  | sort -u | sed 's|href="/cynet/||;s|"||' \
  | while read p; do [ -f "./$p/index.html" ] || [ -z "$p" ] || echo "BROKEN: /$p"; done
```

That loop checks pages only, and a link to a renamed heading still resolves to its page.
Check `#fragment` targets too, after any heading rename or section move:

```sh
cd dist && for f in $(find . -name '*.html'); do grep -o 'href="/cynet/[a-z0-9/-]*#[a-z0-9-]*"' $f; done \
  | sort -u | sed 's|href="/cynet/||;s|"||' \
  | while read l; do p="${l%%#*}"; a="${l##*#}"; \
      grep -q "id=\"$a\"" "./$p/index.html" 2>/dev/null || echo "BROKEN ANCHOR: /$l"; done
```

## Interactive Components

If an interactive component lands, put its client-side logic in `src/lib/<name>.ts` as a
pure, DOM-free module with its own vitest suite; the `.astro` component stays a thin
renderer that wires events to it. The split exists because behaviour is specifiable in
tests and rendering is not. Put anything you would want to assert about — state
transitions, geometry, physics — behind that seam. Reach for a browser only to check that
the wiring and the pixels are right.

For canvas islands: stop the `requestAnimationFrame` loop once the state stops changing
rather than redrawing a still image, and give `prefers-reduced-motion` a path that reaches
the same end state without animating.

A page that embeds a component must be `.mdx`. Renaming a `.md` page is enough — the
frontmatter and sidebar config carry over unchanged.

### Verifying animation in a browser

Chrome suspends `requestAnimationFrame` entirely while a tab is hidden, and throttles
timers in background tabs. If the window is not in the foreground, a canvas island appears
frozen and any measurement of it is meaningless. Check `document.hidden` before concluding
that an animation is broken.

## Starlight Reaches Inside Your Components

`@astrojs/starlight/style/markdown.css` carries this rule:

```css
@layer starlight.content {
  .sl-markdown-content
    :not(a, strong, em, del, span, input, code, br)
    + :not(a, strong, em, del, span, input, code, br, :where(.not-content *)) {
    margin-top: var(--sl-content-gap-y);   /* 1rem */
  }
}
```

It is a **descendant** selector, so it does not stop at the boundary of a component
embedded in MDX. Every element inside your component that follows a sibling silently
picks up a 1rem top margin.

This is easy to misdiagnose, because on an absolutely positioned element `top` offsets the
*margin* edge rather than the border box — so `top: 0` renders 1rem down and looks like a
deliberate inset.

Add Starlight's own escape hatch to the component's root element:

```html
<figure class="cynapse-component not-content">
```

The selector excludes `:where(.not-content *)`, so this clears the whole subtree. Do it for
any component with more than one child, then state spacing outright in the component's own
styles.

Two related traps: these rules live inside `@layer`, so a `document.styleSheets` walk that
only reads top-level `cssRules` will not find them (they are wrapped in a
`CSSLayerBlockRule`); and `--sl-content-gap-y` is themeable, so the margin is not always
1rem.
