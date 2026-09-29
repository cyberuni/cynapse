// Opens the cynapse database Cortex reads: `CORTEX_DB`, else cynapse's own default path.
import { existsSync } from 'node:fs'
import { openStore, resolveDbPath } from 'cynapse'
import type { Store } from '../core/model.ts'

export function openCortexStore(env: NodeJS.ProcessEnv = process.env): { store: Store; label: string } {
	const path = env.CORTEX_DB ?? resolveDbPath()
	if (!existsSync(path)) {
		throw new Error(
			`no cynapse database at ${path}. Seed one with \`pnpm cynapse dev --db ${path} dev seed\`, or point CORTEX_DB at yours.`,
		)
	}
	return { store: openStore({ path }), label: path }
}
