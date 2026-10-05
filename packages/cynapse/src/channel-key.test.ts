import { describe, expect, it } from 'vitest'
import { channelIdOf, channelKey } from './channel-key.js'
import { CynapseError } from './cli-error.js'
import { uuidv5 } from './ids.js'

describe('channelKey', () => {
	it('spells the key as subject:<store>:<native id>', () => {
		expect(channelKey({ store: 'gh', nativeId: 'R_kgDOPfmJ6A' })).toBe('subject:gh:R_kgDOPfmJ6A')
	})

	it('keeps colons in the native id, since the store name has none', () => {
		expect(channelKey({ store: 'linear', nativeId: 'a:b' })).toBe('subject:linear:a:b')
	})

	it('keeps the native id as the store spells it, case and all', () => {
		expect(channelKey({ store: 'gh', nativeId: 'I_kwDO' })).not.toBe(channelKey({ store: 'gh', nativeId: 'i_kwdo' }))
	})

	it.each([
		['an empty store', { store: '', nativeId: 'x' }],
		['an uppercase store', { store: 'GH', nativeId: 'x' }],
		['a store with a colon', { store: 'g:h', nativeId: 'x' }],
		['an empty native id', { store: 'gh', nativeId: '' }],
		['a native id with whitespace', { store: 'gh', nativeId: ' x' }],
	])('rejects %s', (_name, subject) => {
		expect(() => channelKey(subject)).toThrow(CynapseError)
	})
})

describe('channelIdOf', () => {
	it('derives the same UUIDv5 for the same store and native id', () => {
		const subject = { store: 'gh', nativeId: 'R_kgDOPfmJ6A' }
		expect(channelIdOf(subject)).toBe(uuidv5('subject:gh:R_kgDOPfmJ6A'))
		expect(channelIdOf({ ...subject })).toBe(channelIdOf(subject))
	})

	it('never changes the id a subject derives, because entries carry it forever', () => {
		expect(channelIdOf({ store: 'gh', nativeId: 'R_kgDOPfmJ6A' })).toBe('0531b529-5681-5678-a2e4-9a2699fb907b')
	})

	it('derives different ids for the same native id in different stores', () => {
		expect(channelIdOf({ store: 'gh', nativeId: '1' })).not.toBe(channelIdOf({ store: 'asana', nativeId: '1' }))
	})
})
