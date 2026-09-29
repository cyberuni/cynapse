import { describe, expect, it } from 'vitest'
import { renderRef } from './refs.js'

describe(renderRef.name, () => {
	it('renders a GitHub issue or PR shorthand as a link', () => {
		expect(renderRef('gh:cyberuni/cynapse#12')).toEqual({
			ref: 'gh:cyberuni/cynapse#12',
			url: 'https://github.com/cyberuni/cynapse/issues/12',
			markdown: '[cyberuni/cynapse#12](https://github.com/cyberuni/cynapse/issues/12)',
		})
	})

	it('renders a repository, a commit, and a branch', () => {
		expect(renderRef('gh:cyberuni/cynapse').url).toBe('https://github.com/cyberuni/cynapse')
		expect(renderRef('gh:cyberuni/cynapse@0c173b2').url).toBe('https://github.com/cyberuni/cynapse/commit/0c173b2')
		expect(renderRef('gh:cyberuni/cynapse:feat/x').url).toBe('https://github.com/cyberuni/cynapse/tree/feat/x')
	})

	it('renders npm and Asana shorthands', () => {
		expect(renderRef('npm:cynapse').url).toBe('https://www.npmjs.com/package/cynapse')
		expect(renderRef('asana:1234567890').url).toBe('https://app.asana.com/0/0/1234567890')
	})

	it('passes a plain URL through as a link', () => {
		expect(renderRef('https://example.com/a').markdown).toBe('<https://example.com/a>')
	})

	it('leaves an internal handle#seq reference and an unknown scheme as code, with no url', () => {
		expect(renderRef('truss-auth#4')).toEqual({ ref: 'truss-auth#4', markdown: '`truss-auth#4`' })
		expect(renderRef('jira:ABC-1')).toEqual({ ref: 'jira:ABC-1', markdown: '`jira:ABC-1`' })
	})
})
