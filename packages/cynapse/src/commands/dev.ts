import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Command } from 'commander'
import { CynapseError, EXIT_USAGE } from '../cli-error.js'
import { runLoadTest, runLoadWorker } from '../dev/load.js'
import { SEED_START, SeedClock, seed } from '../dev/seed.js'
import { output } from '../output.js'
import { openStore, resolveDbPath } from '../store/open.js'
import { parseInteger } from './context.js'

export function registerDev(program: Command): void {
	const dev = program.command('dev').description('development tools: load test and example data')

	dev
		.command('seed')
		.description('build the example world: SDD hierarchy and graph, cyber-truss arbitration, coordination, feed')
		.option('--reset', 'delete the database first (needs an explicit --db)')
		.action((opts, command: Command) => {
			const explicit = command.optsWithGlobals<{ db?: string }>().db
			// Never delete the real store by default: --reset only touches a database named on the command line.
			if (opts.reset && !explicit) {
				throw new CynapseError(
					`--reset deletes the database; pass --db <path> to name it (refusing to delete the default ${resolveDbPath()})`,
					{ exitCode: EXIT_USAGE },
				)
			}
			const db = explicit ?? resolveDbPath()
			if (opts.reset) for (const suffix of ['', '-wal', '-shm']) rmSync(`${db}${suffix}`, { force: true })
			const clock = new SeedClock(SEED_START)
			const store = openStore({ path: db, clock: clock.now })
			try {
				if (store.listChannels().length) {
					const rebuild = explicit ? '--reset' : '--db <path> --reset'
					throw new CynapseError(`${db} already has channels; pass ${rebuild} to rebuild it`)
				}
				const summary = seed(store, clock)
				output({ db, ...summary }, () =>
					[
						`seeded ${db}`,
						`${summary.channels.length} channels, ${summary.entries} entries, ${summary.participants} participants`,
						`council: ${summary.councilUnread} unread, ${summary.openNeedsInput} open needs-input`,
						...summary.channels.map((s) => `  ${s.handle}  ${s.type}  ${s.state}  ${s.entries} entries`),
					].join('\n'),
				)
			} finally {
				store.close()
			}
		})

	dev
		.command('load-test')
		.description('concurrent processes append to one channel; checks seq and integrity')
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
		.requiredOption('--channel <channel>')
		.requiredOption('--writer <participant>')
		.requiredOption('--count <n>')
		.action((opts, command: Command) => {
			const db = command.optsWithGlobals<{ db?: string }>().db
			if (!db) throw new CynapseError('load-worker needs --db')
			const result = runLoadWorker({
				db,
				channel: opts.channel,
				writer: opts.writer,
				count: parseInteger(opts.count, '--count'),
			})
			console.log(JSON.stringify(result))
		})
}
