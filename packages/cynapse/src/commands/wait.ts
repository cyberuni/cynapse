import { CynapseError, EXIT_TIMEOUT } from '../cli-error.js'
import type { Entry, Store } from '../store/types.js'

/** How often `entry wait` polls the thread. Small, since each poll is one indexed query. */
export const POLL_INTERVAL_MS = 500

export interface WaitOptions {
	timeoutMs: number
	/** Injected so tests can run the loop without really waiting. */
	now?: () => number
	sleep?: (ms: number) => Promise<void>
}

/**
 * Polls the thread of `entryRef` for the first entry after it that `waiter` did not write.
 * Runs in the caller's process with no daemon, and throws a `timeout` CynapseError when
 * nothing arrives within `timeoutMs`. It polls once more at the deadline, so a timeout of
 * `0` is a single check.
 */
export async function waitForReply(
	store: Store,
	entryRef: string,
	waiter: string,
	options: WaitOptions,
): Promise<Entry> {
	const { timeoutMs, now = Date.now, sleep = defaultSleep } = options
	const target = store.entry(entryRef)
	if (!target) throw new CynapseError(`no entry found for "${entryRef}"`, { code: 'not_found' })
	const query = { root: target.root ?? target.id, afterSeq: target.seq, excludeAuthors: [waiter], limit: 1 }
	const deadline = now() + timeoutMs
	for (;;) {
		const [reply] = store.entries(target.channelId, query)
		if (reply) return reply
		const remaining = deadline - now()
		if (remaining <= 0) {
			throw new CynapseError(`no reply to ${target.channel}#${target.seq} within ${timeoutMs / 1000}s`, {
				exitCode: EXIT_TIMEOUT,
				code: 'timeout',
			})
		}
		await sleep(Math.min(POLL_INTERVAL_MS, remaining))
	}
}

function defaultSleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
