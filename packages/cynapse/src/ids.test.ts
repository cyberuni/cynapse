import { describe, expect, it } from 'vitest'
import { timestampOf, uuidv5, uuidv7 } from './ids.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe(uuidv7.name, () => {
	it('is a version 7, RFC 9562 variant UUID', () => {
		const id = uuidv7()
		expect(id).toMatch(UUID)
		expect(id[14]).toBe('7')
		expect('89ab').toContain(id[19])
	})

	it('carries the millisecond timestamp it was minted at', () => {
		expect(timestampOf(uuidv7(1_790_000_000_123))).toBe(1_790_000_000_123)
	})

	it('sorts by creation time, even within one millisecond', () => {
		const ids = Array.from({ length: 200 }, () => uuidv7(1_790_000_000_000))
		expect([...ids].sort()).toEqual(ids)
	})
})

describe(uuidv5.name, () => {
	it('matches the RFC 9562 test vector for the DNS namespace', () => {
		expect(uuidv5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(
			'2ed6657d-e927-568b-95e1-2665a8aea6a2',
		)
	})

	it('derives the same id from the same name', () => {
		expect(uuidv5('dm:alice,bob')).toBe(uuidv5('dm:alice,bob'))
		expect(uuidv5('dm:alice,bob')).not.toBe(uuidv5('dm:alice,carol'))
	})
})
