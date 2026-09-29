import { describe, expect, it } from 'vitest'
import { linkRef, splitRefs } from './refs.ts'

describe('linkRef', () => {
	it('links a GitHub issue or PR shorthand', () => {
		expect(linkRef('gh:cyberuni/cynapse#12')).toEqual({
			text: 'gh:cyberuni/cynapse#12',
			href: 'https://github.com/cyberuni/cynapse/issues/12',
			external: true,
		})
	})

	it('links a GitHub repo shorthand', () => {
		expect(linkRef('gh:cyberuni/cynapse').href).toBe('https://github.com/cyberuni/cynapse')
	})

	it('deep-links an entry shorthand inside Cortex', () => {
		expect(linkRef('m-login#3')).toEqual({ text: 'm-login#3', href: '/s/m-login#3', external: false })
	})

	it('leaves an unknown shorthand as text', () => {
		expect(linkRef('asana:12345')).toEqual({ text: 'asana:12345' })
	})
})

describe('splitRefs', () => {
	it('finds shorthands inside prose', () => {
		expect(splitRefs('Merged in gh:cyberuni/cynapse#34, see m-login#3.')).toEqual([
			'Merged in ',
			{ text: 'gh:cyberuni/cynapse#34', href: 'https://github.com/cyberuni/cynapse/issues/34', external: true },
			', see ',
			{ text: 'm-login#3', href: '/s/m-login#3', external: false },
			'.',
		])
	})
})
