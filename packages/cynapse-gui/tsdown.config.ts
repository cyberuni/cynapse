import { defineConfig } from 'tsdown'

// The server entry only. `vite build` writes the UI into `dist/web/` afterwards, which
// is where `start()` looks for it, so this build cleans `dist/` and vite does not.
export default defineConfig({
	entry: { index: 'src/index.ts' },
	format: 'esm',
	outDir: 'dist',
	platform: 'node',
	target: 'node22',
	// Without this tsdown writes `.mjs` / `.d.mts`, which would move the path in `exports`.
	outExtensions: () => ({ js: '.js' }),
	clean: true,
	dts: true,
})
