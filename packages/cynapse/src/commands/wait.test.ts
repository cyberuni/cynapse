import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CynapseError, EXIT_TIMEOUT } from '../cli-error.js'
import { openStore } from '../store/open.js'
import type { Store } from '../store/types.js'
import { POLL_INTERVAL_MS, waitForReply } from './wait.js'

let store: Store

beforeEach(() => {
	store = openStore({ path: ':memory:' })
	store.createChannel({ handle: 'bob-inbox', type: 'cynapse.address', title: 'Bob', author: 'bob' })
})

afterEach(() => {
	store.close()
})

/** A clock that only moves when the waiter sleeps, running `onSleep` at each poll so a test can reply mid-wait. */
function fakeClock(onSleep: (sleeps: number) => void = () => {}) {
	let now = 0
	const sleeps: number[] = []
	return {
		sleeps,
		now: () => now,
		sleep: async (ms: number) => {
			sleeps.push(ms)
			now += ms
			onSleep(sleeps.length)
		},
	}
}

describe('waitForReply', () => {
	it("returns the first reply from someone else in the thread, skipping the waiter's own and other threads", async () => {
		const question = store.append('bob-inbox', { author: 'alice', type: 'note', body: 'q?' })
		store.append('bob-inbox', { author: 'alice', type: 'note', body: 'also', parent: question.id })
		store.append('bob-inbox', { author: 'carol', type: 'note', body: 'elsewhere' })
		const clock = fakeClock((n) => {
			if (n === 2) store.append('bob-inbox', { author: 'bob', type: 'note', body: 'a', parent: question.id })
		})
		const reply = await waitForReply(store, 'bob-inbox#2', 'alice', { timeoutMs: 10_000, ...clock })
		expect(reply.body).toBe('a')
		expect(clock.sleeps).toEqual([POLL_INTERVAL_MS, POLL_INTERVAL_MS])
	})

	it('waits on the whole thread when given a reply rather than the root', async () => {
		const question = store.append('bob-inbox', { author: 'alice', type: 'note', body: 'q?' })
		const followUp = store.append('bob-inbox', { author: 'alice', type: 'note', body: 'more', parent: question.id })
		store.append('bob-inbox', { author: 'bob', type: 'note', body: 'a', parent: question.id })
		const reply = await waitForReply(store, followUp.id, 'alice', { timeoutMs: 0, ...fakeClock() })
		expect(reply.body).toBe('a')
	})

	it('ignores replies that came before the entry waited on', async () => {
		const question = store.append('bob-inbox', { author: 'alice', type: 'note', body: 'q?' })
		store.append('bob-inbox', { author: 'bob', type: 'note', body: 'old', parent: question.id })
		const followUp = store.append('bob-inbox', { author: 'alice', type: 'note', body: 'more', parent: question.id })
		const error = await waitForReply(store, followUp.id, 'alice', { timeoutMs: 0, ...fakeClock() }).catch((e) => e)
		expect(error).toBeInstanceOf(CynapseError)
	})

	it('times out with a distinct exit code, never sleeping past the deadline', async () => {
		store.append('bob-inbox', { author: 'alice', type: 'note', body: 'q?' })
		const clock = fakeClock()
		const error = await waitForReply(store, 'bob-inbox#2', 'alice', { timeoutMs: 1_200, ...clock }).catch((e) => e)
		expect(error).toBeInstanceOf(CynapseError)
		expect(error).toMatchObject({ code: 'timeout', exitCode: EXIT_TIMEOUT })
		expect(error.message).toBe('no reply to bob-inbox#2 within 1.2s')
		expect(clock.sleeps).toEqual([500, 500, 200])
	})

	it('fails with not_found for an unknown entry', async () => {
		const error = await waitForReply(store, 'bob-inbox#9', 'alice', { timeoutMs: 0, ...fakeClock() }).catch((e) => e)
		expect(error).toMatchObject({ code: 'not_found' })
	})
})
