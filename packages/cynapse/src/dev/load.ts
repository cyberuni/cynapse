import { spawn } from 'node:child_process'
import { SqliteStore } from '../store/sqlite.js'

export interface WorkerResult {
	writer: string
	appended: number
	/** Milliseconds per append, in the order written. */
	latencies: number[]
}

/**
 * One load-test writer: appends `count` entries to `stream`, each in its own write
 * transaction, the way separate CLI invocations would.
 */
export function runLoadWorker(options: { db: string; stream: string; writer: string; count: number }): WorkerResult {
	const store = new SqliteStore({ path: options.db })
	const latencies: number[] = []
	try {
		for (let i = 0; i < options.count; i++) {
			const start = performance.now()
			store.append(options.stream, { author: options.writer, type: 'load.tick', data: { writer: options.writer, i } })
			latencies.push(performance.now() - start)
		}
	} finally {
		store.close()
	}
	return { writer: options.writer, appended: latencies.length, latencies }
}

export interface LoadReport {
	writers: number
	entriesPerWriter: number
	totalEntries: number
	elapsedMs: number
	entriesPerSecond: number
	latencyMs: { p50: number; p95: number; p99: number; max: number }
	seqContiguous: boolean
	seqUnique: boolean
	perWriterOrderKept: boolean
	integrityCheck: string
	ok: boolean
}

/**
 * Starts `writers` separate processes that all append to one stream at once, then checks
 * what the conclusion claims SQLite's write lock gives: `seq` contiguous and unique, each
 * writer's entries in its own order, and a clean `integrity_check`.
 *
 * `workerCommand` launches the CLI; the worker is `dev load-worker`.
 */
export async function runLoadTest(options: {
	db: string
	writers: number
	entriesPerWriter: number
	workerCommand: string[]
}): Promise<LoadReport> {
	const stream = 'load-test'
	const setup = new SqliteStore({ path: options.db })
	setup.createStream({ handle: stream, type: 'load.test', title: 'Concurrent writers', author: 'load' })
	setup.close()

	const [command, ...baseArgs] = options.workerCommand as [string, ...string[]]
	const started = performance.now()
	const results = await Promise.all(
		Array.from({ length: options.writers }, (_, i) =>
			runProcess(command, [
				...baseArgs,
				'dev',
				'load-worker',
				'--db',
				options.db,
				'--stream',
				stream,
				'--writer',
				`w${String(i).padStart(2, '0')}`,
				'--count',
				String(options.entriesPerWriter),
			]).then((stdout) => JSON.parse(stdout) as WorkerResult),
		),
	)
	const elapsedMs = performance.now() - started

	const store = new SqliteStore({ path: options.db })
	try {
		const entries = store.entries(stream, { types: ['load.tick'] })
		const seqs = store.entries(stream, { metaOnly: true }).map((e) => e.seq)
		const seqContiguous = seqs.every((seq, i) => seq === i + 1)
		const seqUnique = new Set(seqs).size === seqs.length
		const perWriterOrderKept = results.every((result) => {
			const mine = entries.filter((e) => e.author === result.writer).map((e) => e.data?.i as number)
			return mine.length === result.appended && mine.every((n, i) => n === i)
		})
		const integrityCheck = store.integrityCheck()
		const latencies = results.flatMap((r) => r.latencies).sort((a, b) => a - b)
		const at = (p: number) => round(latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))] ?? 0)
		const totalEntries = entries.length
		return {
			writers: options.writers,
			entriesPerWriter: options.entriesPerWriter,
			totalEntries,
			elapsedMs: round(elapsedMs),
			entriesPerSecond: round((totalEntries / elapsedMs) * 1000),
			latencyMs: { p50: at(0.5), p95: at(0.95), p99: at(0.99), max: round(latencies.at(-1) ?? 0) },
			seqContiguous,
			seqUnique,
			perWriterOrderKept,
			integrityCheck,
			ok:
				seqContiguous &&
				seqUnique &&
				perWriterOrderKept &&
				integrityCheck === 'ok' &&
				totalEntries === options.writers * options.entriesPerWriter,
		}
	} finally {
		store.close()
	}
}

function runProcess(command: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
		let stdout = ''
		let stderr = ''
		child.stdout.on('data', (chunk) => {
			stdout += chunk
		})
		child.stderr.on('data', (chunk) => {
			stderr += chunk
		})
		child.on('error', reject)
		child.on('close', (code) => {
			if (code === 0) resolve(stdout)
			else reject(new Error(`load worker exited ${code}: ${stderr.trim()}`))
		})
	})
}

function round(n: number): number {
	return Math.round(n * 100) / 100
}
