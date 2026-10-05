import { describe, expect, it } from 'vitest'
import { createKeymap } from './keys.ts'

describe('createKeymap', () => {
	it('fires a single-key binding', () => {
		const keymap = createKeymap(['j', 'k'])
		expect(keymap.press('j')).toBe('j')
	})

	it('waits for the second key of a chord', () => {
		const keymap = createKeymap(['g t', 'g h', 'j'])
		expect(keymap.press('g')).toBeUndefined()
		expect(keymap.press('t')).toBe('g t')
	})

	it('drops an unknown chord and starts over', () => {
		const keymap = createKeymap(['g t', 'j'])
		keymap.press('g')
		expect(keymap.press('x')).toBeUndefined()
		expect(keymap.press('j')).toBe('j')
	})

	it('forgets a pending chord after the timeout', () => {
		let now = 0
		const keymap = createKeymap(['g t', 't'], { timeout: 1000, now: () => now })
		keymap.press('g')
		now = 2000
		expect(keymap.press('t')).toBe('t')
	})
})
