// Seeds the example world into the database Cortex reads: `CORTEX_DB`, else cynapse's
// own default ($CYNAPSE_HOME/cynapse.db). Extra arguments pass through, so
// `pnpm seed --reset` rebuilds it.
import { spawnSync } from 'node:child_process'

// biome-ignore lint/suspicious/noUndeclaredEnvVars: a root script, not a turbo task
const db = process.env.CORTEX_DB ? ['--db', process.env.CORTEX_DB] : []
const { status } = spawnSync('pnpm', ['cynapse', 'dev', ...db, 'dev', 'seed', ...process.argv.slice(2)], {
	stdio: 'inherit',
	shell: process.platform === 'win32',
})
process.exit(status ?? 1)
