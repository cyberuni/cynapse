import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { channelIdOf } from '../channel-key.js'
import { CynapseError } from '../cli-error.js'
import { openStore } from './open.js'
import type { Store } from './types.js'

let store: Store

beforeEach(() => {
	store = openStore({ path: ':memory:' })
})

afterEach(() => {
	store.close()
})

function captureError(fn: () => unknown): CynapseError {
	try {
		fn()
	} catch (error) {
		if (error instanceof CynapseError) return error
		throw error
	}
	throw new Error('expected a CynapseError')
}

const repo = { store: 'gh', nativeId: 'R_kgDOPfmJ6A' }
const issue = { store: 'gh', nativeId: 'I_kwDOPfmJ6M7AAAAB' }

function repoAddress(owner = 'unional') {
	return store.createChannel({
		handle: 'gh:cyberuni/cynapse',
		type: 'cynapse.repo',
		title: 'cyberuni/cynapse',
		author: 'legion',
		subject: repo,
		kind: 'address',
		owner,
	})
}

describe('channels keyed by subject', () => {
	it('derives the channel id from the store and native id', () => {
		const channel = repoAddress()
		expect(channel.id).toBe(channelIdOf(repo))
		expect(channel.subjects).toEqual([repo])
		expect(store.getChannelBySubject(repo)?.id).toBe(channel.id)
	})

	it('is a no-op for a second consumer opening the same subject, whatever type it perceives', () => {
		const first = store.createChannel({
			handle: 'gh:cyberuni/cynapse/issues/12',
			type: 'sdd.mission',
			title: 'Add auth',
			author: 'alice',
			subject: issue,
		})
		const second = store.createChannel({
			handle: 'gh:cyberuni/cynapse/issues/12',
			type: 'truss.run',
			title: 'Auth work',
			author: 'bob',
			subject: issue,
		})
		expect(second.id).toBe(first.id)
		expect(second.type).toBe('sdd.mission')
		expect(store.listChannels()).toHaveLength(1)
		expect(store.entries(first.id).map((e) => e.type)).toEqual(['cynapse.channel.created'])
	})

	it('records the subject, kind and owner in the created entry', () => {
		const channel = repoAddress()
		expect(store.entries(channel.id)[0]?.data).toMatchObject({ subject: repo, kind: 'address', owner: 'unional' })
	})

	it('accepts a readable reference with a colon as the handle', () => {
		expect(repoAddress().handle).toBe('gh:cyberuni/cynapse')
		expect(store.getChannel('gh:cyberuni/cynapse')?.id).toBe(channelIdOf(repo))
	})

	it('refuses a free-string key in the reserved subject: form', () => {
		const error = captureError(() =>
			store.createChannel({ handle: 'x', type: 't', title: 'x', author: 'a', key: 'subject:gh:R_kgDOPfmJ6A' }),
		)
		expect(error.message).toContain('subject:')
	})

	it('refuses a subject together with an anchor or a free-string key', () => {
		expect(() =>
			store.createChannel({ handle: 'x', type: 't', title: 'x', author: 'a', subject: issue, key: 'k' }),
		).toThrow(CynapseError)
	})
})

describe('channel kind and owner', () => {
	it('defaults to a work channel with no owner', () => {
		const channel = store.createChannel({ handle: 'auth', type: 'sdd.mission', title: 'Add auth', author: 'alice' })
		expect(channel.kind).toBe('work')
		expect(channel.owner).toBeUndefined()
		expect(channel.subjects).toEqual([])
	})

	it('round-trips an address channel and its owner', () => {
		repoAddress()
		expect(store.getChannel('gh:cyberuni/cynapse')).toMatchObject({ kind: 'address', owner: 'unional' })
		expect(store.listChannels({ kind: 'address' }).map((c) => c.handle)).toEqual(['gh:cyberuni/cynapse'])
		expect(store.listChannels({ kind: 'work' })).toEqual([])
	})

	it('requires a subject and an owner on an address channel and refuses an owner on a work channel', () => {
		expect(() =>
			store.createChannel({ handle: 'a', type: 't', title: 'a', author: 'x', kind: 'address', owner: 'x' }),
		).toThrow(/subject/)
		expect(() =>
			store.createChannel({ handle: 'a', type: 't', title: 'a', author: 'x', kind: 'address', subject: repo }),
		).toThrow(/owner/)
		expect(() => store.createChannel({ handle: 'w', type: 't', title: 'w', author: 'x', owner: 'x' })).toThrow(/owner/)
	})

	it('refuses an address channel anchored in another channel', () => {
		store.createChannel({ handle: 'auth', type: 'sdd.mission', title: 'Add auth', author: 'alice' })
		expect(() =>
			store.createChannel({
				handle: 'arb',
				type: 't',
				title: 'arb',
				author: 'alice',
				anchor: 'auth#1',
				kind: 'address',
				owner: 'alice',
			}),
		).toThrow(/anchor/)
	})

	it('fails with id_conflict when the same subject is opened as the other kind or with another owner', () => {
		repoAddress()
		expect(
			captureError(() =>
				store.createChannel({
					handle: 'gh:cyberuni/cynapse',
					type: 'cynapse.repo',
					title: 'x',
					author: 'a',
					subject: repo,
				}),
			).code,
		).toBe('id_conflict')
		expect(captureError(() => repoAddress('someone-else')).code).toBe('id_conflict')
	})

	it('changes the owner and logs it as a cynapse entry in the same write', () => {
		const channel = repoAddress()
		const logged = store.setOwner(channel.id, 'bob', 'unional')
		expect(logged).toMatchObject({
			type: 'cynapse.channel.owner-changed',
			author: 'unional',
			data: { from: 'unional', to: 'bob' },
		})
		expect(store.getChannel(channel.id)?.owner).toBe('bob')
	})

	it('refuses an owner on a work channel', () => {
		store.createChannel({ handle: 'auth', type: 'sdd.mission', title: 'Add auth', author: 'alice' })
		expect(() => store.setOwner('auth', 'bob', 'alice')).toThrow(/work channel/)
		expect(store.entries('auth')).toHaveLength(1)
	})
})

describe('alias keys', () => {
	const moved = { store: 'gh', nativeId: 'I_kwDOOtherRepo' }

	function issueChannel() {
		return store.createChannel({
			handle: 'gh:cyberuni/cynapse/issues/12',
			type: 'sdd.mission',
			title: 'Add auth',
			author: 'alice',
			subject: issue,
		})
	}

	it('resolves the channel from any of its keys after a move adds one', () => {
		const channel = issueChannel()
		expect(store.addSubject(channel.id, moved, 'alice').subjects).toEqual([issue, moved])
		expect(store.entries(channel.id).at(-1)).toMatchObject({
			type: 'cynapse.channel.subject-added',
			author: 'alice',
			data: { subject: moved },
		})
		expect(store.getChannelBySubject(moved)?.id).toBe(channel.id)
	})

	it('opens the existing channel when created from an alias key, keeping its identity', () => {
		const channel = issueChannel()
		store.addSubject(channel.id, moved, 'alice')
		const reopened = store.createChannel({
			handle: 'gh:cyberuni/cynapse/issues/12',
			type: 'sdd.mission',
			title: 'Add auth',
			author: 'bob',
			subject: moved,
		})
		expect(reopened.id).toBe(channel.id)
		expect(store.listChannels()).toHaveLength(1)
	})

	it('is a no-op to add a key the channel already has', () => {
		const channel = issueChannel()
		store.addSubject(channel.id, issue, 'alice')
		expect(store.getChannel(channel.id)?.subjects).toEqual([issue])
		expect(store.entries(channel.id)).toHaveLength(1)
	})

	it('refuses a key that belongs to another channel', () => {
		const channel = issueChannel()
		repoAddress()
		expect(() => store.addSubject(channel.id, repo, 'alice')).toThrow(/already/)
	})
})

describe('registerAddress', () => {
	it('mints a cynapse subject for an address with no native id', () => {
		const folder = store.registerAddress({
			handle: 'notes',
			type: 'cynapse.folder',
			title: '~/notes',
			author: 'alice',
			owner: 'alice',
		})
		expect(folder).toMatchObject({ kind: 'address', owner: 'alice' })
		const [subject] = folder.subjects
		expect(subject?.store).toBe('cynapse')
		expect(subject?.nativeId[14]).toBe('7')
		expect(folder.id).toBe(channelIdOf(subject as { store: string; nativeId: string }))
	})

	it('mints a new address each time, so the caller keeps the one it got', () => {
		const a = store.registerAddress({ handle: 'a', type: 'cynapse.folder', title: 'a', author: 'x', owner: 'x' })
		const b = store.registerAddress({ handle: 'b', type: 'cynapse.folder', title: 'b', author: 'x', owner: 'x' })
		expect(a.id).not.toBe(b.id)
	})
})

describe('change token', () => {
	it('moves for a subject channel created, keyed again or re-owned', () => {
		const channel = repoAddress()
		const created = store.changes()
		expect(created.channels.map((c) => c.channelId)).toEqual([channel.id])
		store.addSubject(channel.id, { store: 'gh', nativeId: 'R_moved' }, 'unional')
		const keyed = store.changes(created.token)
		expect(keyed.channels.map((c) => c.lastSeq)).toEqual([2])
		store.setOwner(channel.id, 'bob', 'unional')
		expect(store.changes(keyed.token).channels.map((c) => c.lastSeq)).toEqual([3])
	})
})
