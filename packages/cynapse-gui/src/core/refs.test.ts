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

	it('links GitHub commits and branches', () => {
		expect(linkRef('gh:cyberuni/cyber-truss@a1b2c3d').href).toBe(
			'https://github.com/cyberuni/cyber-truss/commit/a1b2c3d',
		)
		expect(linkRef('gh:cyberuni/cyber-truss:fix/pagination').href).toBe(
			'https://github.com/cyberuni/cyber-truss/tree/fix/pagination',
		)
	})

	it('links npm, Asana, and plain URLs', () => {
		expect(linkRef('npm:cynapse').href).toBe('https://www.npmjs.com/package/cynapse')
		expect(linkRef('asana:12345').href).toBe('https://app.asana.com/0/0/12345')
		expect(linkRef('https://example.com/x').href).toBe('https://example.com/x')
	})

	it('deep-links an entry shorthand inside the GUI', () => {
		expect(linkRef('m-login#3')).toEqual({ text: 'm-login#3', href: '/s/m-login#3', external: false })
	})

	it('leaves an unknown shorthand as text', () => {
		expect(linkRef('jira:ABC-1')).toEqual({ text: 'jira:ABC-1' })
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
