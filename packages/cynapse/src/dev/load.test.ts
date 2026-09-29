import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { runLoadTest } from './load.js'

const cli = fileURLToPath(new URL('../cli.ts', import.meta.url))
let dir: string | undefined

afterEach(() => {
	if (dir) rmSync(dir, { recursive: true, force: true })
})

it('keeps seq contiguous and unique with 10+ concurrent writer processes', { timeout: 60_000 }, async () => {
	dir = mkdtempSync(join(tmpdir(), 'cynapse-load-'))
	const report = await runLoadTest({
		db: join(dir, 'load.db'),
		writers: 12,
		entriesPerWriter: 50,
		workerCommand: [process.execPath, '--import', 'tsx', cli],
	})
	expect(report).toMatchObject({
		totalEntries: 600,
		seqContiguous: true,
		seqUnique: true,
		perWriterOrderKept: true,
		integrityCheck: 'ok',
		ok: true,
	})
})
