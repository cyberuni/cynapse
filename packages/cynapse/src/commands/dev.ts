import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Command } from 'commander'
import { CynapseError } from '../cli-error.js'
import { runLoadTest, runLoadWorker } from '../dev/load.js'
import { output } from '../output.js'
import { parseInteger } from './context.js'

export function registerDev(program: Command): void {
	const dev = program.command('dev').description('development tools: load test and example data')

	dev
		.command('load-test')
		.description('concurrent processes append to one stream; checks seq and integrity')
		.option('--writers <n>', 'concurrent writer processes', '12')
		.option('--entries <n>', 'entries per writer', '200')
		.action(async (opts, command: Command) => {
			// Never the real store: a load test gets --db or a fresh temp file.
			const db =
				command.optsWithGlobals<{ db?: string }>().db ?? join(mkdtempSync(join(tmpdir(), 'cynapse-load-')), 'load.db')
			const report = await runLoadTest({
				db,
				writers: parseInteger(opts.writers, '--writers'),
				entriesPerWriter: parseInteger(opts.entries, '--entries'),
				// Re-run this same CLI, however it was launched (built, or from source under tsx).
				workerCommand: [process.execPath, ...process.execArgv, process.argv[1] as string],
			})
			output({ db, ...report }, () =>
				[
					`${report.writers} writers × ${report.entriesPerWriter} entries = ${report.totalEntries} in ${report.elapsedMs} ms (${report.entriesPerSecond}/s)`,
					`append latency ms: p50 ${report.latencyMs.p50}, p95 ${report.latencyMs.p95}, p99 ${report.latencyMs.p99}, max ${report.latencyMs.max}`,
					`seq contiguous: ${report.seqContiguous}, unique: ${report.seqUnique}, per-writer order kept: ${report.perWriterOrderKept}`,
					`integrity_check: ${report.integrityCheck}`,
					`db: ${db}`,
				].join('\n'),
			)
			if (!report.ok) throw new CynapseError('load test failed its checks')
		})

	dev
		.command('load-worker', { hidden: true })
		.requiredOption('--stream <stream>')
		.requiredOption('--writer <participant>')
		.requiredOption('--count <n>')
		.action((opts, command: Command) => {
			const db = command.optsWithGlobals<{ db?: string }>().db
			if (!db) throw new CynapseError('load-worker needs --db')
			const result = runLoadWorker({
				db,
				stream: opts.stream,
				writer: opts.writer,
				count: parseInteger(opts.count, '--count'),
			})
			console.log(JSON.stringify(result))
		})
}
