import { defineConfig } from 'tsdown'

// Two configs, because the two entries want opposite dependency treatment.
// They share an `outDir`, which is safe: tsdown hoists `clean` and runs it once
// across every config before any build writes, so neither wipes the other.
const shared = {
	format: 'esm',
	outDir: 'dist',
	platform: 'node',
	target: 'node22',
	// Without this tsdown writes `.mjs` / `.d.mts`, which would move the
	// published paths named in `exports` and `bin`.
	outExtensions: () => ({ js: '.js' }),
	clean: true,
} as const

export default defineConfig([
	{
		// Library entry. Dependencies stay EXTERNAL on purpose: `commander` types
		// surface in the public `.d.ts`, and a consumer that also uses commander
		// must share one copy rather than get a private inlined duplicate.
		...shared,
		entry: { index: 'src/index.ts' },
		dts: true,
	},
	{
		// CLI entry. Every runtime dependency is inlined so the published
		// `dist/cli.js` runs with no `node_modules` present at all. `bin` points
		// straight at this file, so the `#!/usr/bin/env node` shebang in
		// `src/cli.ts` has to survive — tsdown preserves it.
		//
		// `alwaysBundle` lists this package's own `dependencies`, since those are
		// the only ones tsdown externalizes by default. Anything they pull in
		// transitively is not in that list and so gets inlined automatically.
		// `onlyBundle: false` silences the "bundled a dependency" warnings that
		// are the whole point here.
		...shared,
		entry: { cli: 'src/cli.ts' },
		dts: false,
		deps: {
			alwaysBundle: [/^commander(\/|$)/],
			onlyBundle: false,
		},
	},
])
