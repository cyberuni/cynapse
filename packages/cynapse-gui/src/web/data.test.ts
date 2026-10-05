import { describe, expect, it } from 'vitest'
import { clampIndex } from './data.ts'

describe('clampIndex', () => {
	it('stays at 0 while the list is empty', () => {
		expect(clampIndex(1, 0)).toBe(0)
		expect(clampIndex(-1, 0)).toBe(0)
	})

	it('stops at either end of the list', () => {
		expect(clampIndex(5, 3)).toBe(2)
		expect(clampIndex(-1, 3)).toBe(0)
		expect(clampIndex(1, 3)).toBe(1)
	})
})
