import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { channelIdOf } from '../channel-key.js'
import { CynapseError, EXIT_AMBIGUOUS_ADDRESS, EXIT_UNKNOWN_ADDRESS } from '../cli-error.js'
import { uuidv5 } from '../ids.js'
import { openStore } from './open.js'
import type { Participant, Store } from './types.js'

let store: Store
let legion: Participant

beforeEach(() => {
	store = openStore({ path: ':memory:' })
	legion = store.registerParticipant({
		key: 'cyberlegion:unit/37757199c374e73a',
		kind: 'service',
		name: 'cyberlegion',
	}).participant
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

function register(key: string, name: string, kind: Participant['kind'] = 'agent') {
	return store.registerParticipant({ key, kind, name, registeredBy: legion.id })
}

describe('registerParticipant', () => {
	it('derives the id from the key and creates an address channel owned by the participant', () => {
		const { participant, channel } = register('cyberlegion:role/reviewer', 'reviewer')

		expect(participant).toEqual({
			id: uuidv5('cyberlegion:role/reviewer'),
			kind: 'agent',
			name: 'reviewer',
			status: 'live',
			key: 'cyberlegion:role/reviewer',
			registeredBy: legion.id,
		})
		expect(channel).toMatchObject({
			id: channelIdOf({ store: 'cynapse', nativeId: participant.id }),
			handle: 'reviewer',
			kind: 'address',
			owner: participant.id,
			subjects: [{ store: 'cynapse', nativeId: participant.id }],
		})
	})

	it('writes cynapse.participant.registered in the address channel, by the registering unit', () => {
		const { participant, channel } = register('cyberlegion:role/reviewer', 'reviewer')

		const registered = store.entries(channel.id, { types: ['cynapse.participant.registered'] })
		expect(registered).toHaveLength(1)
		expect(registered[0]).toMatchObject({
			author: legion.id,
			data: {
				participant: participant.id,
				key: 'cyberlegion:role/reviewer',
				kind: 'agent',
				name: 'reviewer',
				registeredBy: legion.id,
			},
		})
	})

	it('lets a unit register itself as a service, with no registrant given', () => {
		expect(legion).toMatchObject({ kind: 'service', registeredBy: legion.id })
		const address = store.getChannelBySubject({ store: 'cynapse', nativeId: legion.id })
		expect(store.entries(address?.id ?? '', { types: ['cynapse.participant.*'] })[0]?.author).toBe(legion.id)
	})

	it('refuses a self-registration that is not a service', () => {
		const error = captureError(() => store.registerParticipant({ key: 'cyberlegion:role/x', kind: 'agent', name: 'x' }))
		expect(error.message).toContain('service')
	})

	it('refuses a registrant that is not a registered service', () => {
		const human = store.registerParticipant({
			key: 'cyberlegion:human/unional',
			kind: 'human',
			name: 'unional',
			registeredBy: legion.id,
		}).participant
		expect(
			captureError(() =>
				store.registerParticipant({ key: 'cyberlegion:role/b', kind: 'agent', name: 'b', registeredBy: human.id }),
			).message,
		).toContain('service')
		expect(
			captureError(() =>
				store.registerParticipant({ key: 'cyberlegion:role/c', kind: 'agent', name: 'c', registeredBy: 'nobody' }),
			).code,
		).toBe('not_found')
	})

	it('requires the key to be namespaced by the registering unit', () => {
		expect(captureError(() => register('reviewer', 'reviewer')).message).toContain('namespaced')
		expect(captureError(() => register('cyberlegion:', 'reviewer')).message).toContain('namespaced')
	})

	it('is a no-op when the same key registers again, writing nothing', () => {
		const first = register('cyberlegion:role/reviewer', 'reviewer')
		const again = register('cyberlegion:role/reviewer', 'reviewer')

		expect(again).toEqual(first)
		expect(store.entries(first.channel.id)).toEqual(store.entries(again.channel.id))
		expect(store.entries(first.channel.id, { types: ['cynapse.participant.*'] })).toHaveLength(1)
	})

	it('fails with id_conflict when the same key registers with a different kind', () => {
		register('cyberlegion:role/reviewer', 'reviewer')
		const error = captureError(() => register('cyberlegion:role/reviewer', 'reviewer', 'human'))
		expect(error.code).toBe('id_conflict')
		expect(error.message).toContain('kind')
	})

	it('gives a second participant with a taken name a handle of its own', () => {
		const first = register('cyberlegion:role/reviewer', 'reviewer')
		const second = register('other:role/reviewer', 'reviewer')

		expect(first.channel.handle).toBe('reviewer')
		expect(second.channel.handle).toBe(`reviewer-${second.participant.id.slice(0, 8)}`)
	})

	it('derives a valid handle from a name that is not one', () => {
		const { channel } = register('cyberlegion:human/ada', 'Ada Lovelace', 'human')
		expect(channel.handle).toBe('Ada-Lovelace')
	})

	it('makes a handle from a name with long runs of dashes in linear time', () => {
		const dashes = '-'.repeat(50_000)
		const started = performance.now()
		const inner = register('cyberlegion:role/inner', `x${dashes}y`).channel
		const edges = register('cyberlegion:role/edges', `${dashes}z${dashes}`).channel
		expect(performance.now() - started).toBeLessThan(1_000)
		expect(inner.handle).toBe(`x${dashes}y`)
		expect(edges.handle).toBe('z')
	})

	it('bumps the change token, since the registration is an append', () => {
		const before = store.changes().token
		const { channel } = register('cyberlegion:role/reviewer', 'reviewer')
		expect(store.changes(before).channels.map((c) => c.channelId)).toEqual([channel.id])
	})
})

describe('retireParticipant', () => {
	it('marks the participant retired and writes cynapse.participant.retired, keeping the channel readable', () => {
		const { participant, channel } = register('cyberlegion:role/reviewer', 'reviewer')

		const retired = store.retireParticipant(participant.id, legion.id)

		expect(retired.status).toBe('retired')
		expect(store.participants({ status: 'retired' }).map((p) => p.id)).toEqual([participant.id])
		const entries = store.entries(channel.id, { types: ['cynapse.participant.*'] })
		expect(entries.map((e) => [e.type, e.author])).toEqual([
			['cynapse.participant.registered', legion.id],
			['cynapse.participant.retired', legion.id],
		])
		expect(entries[1]?.data).toEqual({ participant: participant.id })
	})

	it('is a no-op on a participant already retired', () => {
		const { participant, channel } = register('cyberlegion:role/reviewer', 'reviewer')
		store.retireParticipant(participant.id, legion.id)
		store.retireParticipant(participant.id, legion.id)
		expect(store.entries(channel.id, { types: ['cynapse.participant.retired'] })).toHaveLength(1)
	})

	it('fails for an unknown participant', () => {
		expect(captureError(() => store.retireParticipant('nobody', legion.id)).code).toBe('not_found')
	})

	it('is revived by registering the key again, in the same address channel', () => {
		const { participant, channel } = register('cyberlegion:role/reviewer', 'reviewer')
		store.retireParticipant(participant.id, legion.id)

		const revived = register('cyberlegion:role/reviewer', 'reviewer')

		expect(revived.participant.status).toBe('live')
		expect(revived.channel.id).toBe(channel.id)
		const types = store.entries(channel.id, { types: ['cynapse.participant.*'] }).map((e) => e.type)
		expect(types).toEqual([
			'cynapse.participant.registered',
			'cynapse.participant.retired',
			'cynapse.participant.registered',
		])
		expect(store.resolveAddress('reviewer').participant.id).toBe(participant.id)
	})
})

describe('renameParticipant', () => {
	it('renames the participant and its address handle, keeping the old handle as an alias', () => {
		const { participant, channel } = register('cyberlegion:role/reviewer', 'reviewer')

		const renamed = store.renameParticipant(participant.id, 'critic', legion.id)

		expect(renamed.name).toBe('critic')
		expect(store.getChannel(channel.id)).toMatchObject({ handle: 'critic', aliases: ['reviewer'] })
		const last = store.entries(channel.id, { types: ['cynapse.participant.renamed'] })
		expect(last.map((e) => e.data)).toEqual([{ participant: participant.id, from: 'reviewer', to: 'critic' }])
	})

	it('resolves the old handle as an alias, and the new name', () => {
		const { participant } = register('cyberlegion:role/reviewer', 'reviewer')
		store.renameParticipant(participant.id, 'critic', legion.id)

		expect(store.resolveAddress('critic').participant.id).toBe(participant.id)
		expect(store.resolveAddress('reviewer').participant.id).toBe(participant.id)
	})

	it('writes nothing when the name is unchanged', () => {
		const { participant, channel } = register('cyberlegion:role/reviewer', 'reviewer')
		const before = store.entries(channel.id).length
		store.renameParticipant(participant.id, 'reviewer', legion.id)
		expect(store.entries(channel.id)).toHaveLength(before)
	})
})

describe('resolveAddress', () => {
	it('returns the one live participant with that name, with its address channel', () => {
		const { participant, channel } = register('cyberlegion:role/reviewer', 'reviewer')
		expect(store.resolveAddress('reviewer')).toEqual({ participant, channel: store.getChannel(channel.id) })
	})

	it('matches exactly, never by prefix or case', () => {
		register('cyberlegion:role/reviewer', 'reviewer')
		expect(captureError(() => store.resolveAddress('review')).code).toBe('unknown_address')
		expect(captureError(() => store.resolveAddress('Reviewer')).code).toBe('unknown_address')
	})

	it('fails with unknown_address and its own exit code when nothing matches', () => {
		const error = captureError(() => store.resolveAddress('reviewer'))
		expect(error).toMatchObject({ code: 'unknown_address', exitCode: EXIT_UNKNOWN_ADDRESS })
	})

	it('fails with ambiguous_address listing every candidate, and never picks one', () => {
		const first = register('cyberlegion:role/reviewer', 'reviewer').participant
		const second = register('other:role/reviewer', 'reviewer', 'human').participant

		const error = captureError(() => store.resolveAddress('reviewer'))

		expect(error).toMatchObject({ code: 'ambiguous_address', exitCode: EXIT_AMBIGUOUS_ADDRESS })
		const candidates = [first, second]
			.map(({ id, kind, name, registeredBy }) => ({ id, kind, name, registeredBy }))
			.sort((a, b) => a.id.localeCompare(b.id))
		expect(error.details).toEqual({ candidates })
		for (const candidate of candidates) expect(error.message).toContain(candidate.id)
	})

	it('ignores retired participants', () => {
		const first = register('cyberlegion:role/reviewer', 'reviewer').participant
		const second = register('other:role/reviewer', 'reviewer').participant
		store.retireParticipant(first.id, legion.id)

		expect(store.resolveAddress('reviewer').participant.id).toBe(second.id)
		store.retireParticipant(second.id, legion.id)
		expect(captureError(() => store.resolveAddress('reviewer')).code).toBe('unknown_address')
	})

	it('narrows by kind', () => {
		register('cyberlegion:role/reviewer', 'reviewer')
		const human = register('cyberlegion:human/reviewer', 'reviewer', 'human').participant

		expect(store.resolveAddress('reviewer', { kinds: ['human'] }).participant.id).toBe(human.id)
		expect(captureError(() => store.resolveAddress('reviewer', { kinds: ['service'] })).code).toBe('unknown_address')
	})

	it('matches a handle that differs from the name', () => {
		register('cyberlegion:role/reviewer', 'reviewer')
		const second = register('other:role/reviewer', 'reviewer')

		expect(store.resolveAddress(second.channel.handle).participant.id).toBe(second.participant.id)
	})

	it('resolves a pre-registry participant by name, with no address channel', () => {
		store.addParticipant({ id: 'alice', kind: 'human', name: 'Alice' })
		expect(store.resolveAddress('Alice')).toEqual({
			participant: { id: 'alice', kind: 'human', name: 'Alice', status: 'live' },
		})
	})

	it('does not count a participant twice when its name and handle both match', () => {
		const { participant } = register('cyberlegion:role/reviewer', 'reviewer')
		expect(store.resolveAddress('reviewer').participant.id).toBe(participant.id)
	})
})

describe('participants', () => {
	it('lists by status and by registering unit, for reconciliation', () => {
		const other = store.registerParticipant({ key: 'hive:unit/1', kind: 'service', name: 'hive' }).participant
		const reviewer = register('cyberlegion:role/reviewer', 'reviewer').participant
		const drone = store.registerParticipant({
			key: 'hive:drone/1',
			kind: 'agent',
			name: 'drone',
			registeredBy: other.id,
		}).participant
		store.retireParticipant(drone.id, other.id)

		expect(store.participants({ registeredBy: legion.id }).map((p) => p.id)).toEqual([legion.id, reviewer.id].sort())
		expect(store.participants({ registeredBy: other.id, status: 'live' }).map((p) => p.id)).toEqual([other.id])
		expect(store.participants({ status: 'retired' }).map((p) => p.id)).toEqual([drone.id])
	})
})
