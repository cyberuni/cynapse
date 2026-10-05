---
'cynapse': minor
---

Add `excludeTags` and `excludeAuthors` to `ViewFilter`, so `entries()`, `search()`, saved views and
`appendUnless` can leave out entries that carry a tag now or that someone wrote. `entry list` and
`channel view` take them as `--exclude-tag` and `--exclude-author`; `--exclude-tag cynapse.handled`
lists what is still unhandled.
