// Opens the database the GUI reads in development: `CYNAPSE_GUI_DB`, else cynapse's default.
import { existsSync } from 'node:fs'
import { openStore, resolveDbPath } from 'cynapse'
import type { Store } from '../core/model.ts'

export function openGuiStore(env: NodeJS.ProcessEnv = process.env): { store: Store; label: string } {
	const path = env.CYNAPSE_GUI_DB ?? resolveDbPath()
	if (!existsSync(path)) {
		throw new Error(
			`no cynapse database at ${path}. Seed the example one with \`pnpm seed\` from the repository root, or point CYNAPSE_GUI_DB at yours.`,
		)
	}
	return { store: openStore({ path }), label: path }
}
