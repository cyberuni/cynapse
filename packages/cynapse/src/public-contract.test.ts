import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as cliError from './cli-error.js'
import * as cynapse from './index.js'
import { HANDLED_TAG } from './store/sqlite.js'

// The Public contract page is the release's promise to a runtime. Every list on it is
// checked against the source here, so the page cannot drift from what ships.

const SRC = import.meta.dirname
const PAGE = join(SRC, '../../../apps/web/src/content/docs/public-contract.md')

/** The backticked first cell of every table row under `## heading`, up to the next `##`. */
function firstColumn(heading: string): string[] {
	const page = readFileSync(PAGE, 'utf8')
	const start = page.indexOf(`\n## ${heading}\n`)
	if (start < 0) throw new Error(`no "## ${heading}" section on the Public contract page`)
	const end = page.indexOf('\n## ', start + 1)
	const section = page.slice(start, end < 0 ? undefined : end)
	return [...section.matchAll(/^\| `([^`]+)` \|/gm)].map((match) => match[1] as string)
}

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { recursive: true, encoding: 'utf8' })
		.filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
		.map((file) => join(dir, file))
}

function sorted(values: Iterable<string>): string[] {
	return [...new Set(values)].sort()
}

describe('the Public contract page', () => {
	it('lists every runtime export of the package', () => {
		expect(sorted(firstColumn('Exports'))).toEqual(sorted(Object.keys(cynapse)))
	})

	it('lists every entry type the store writes', () => {
		const store = readFileSync(join(SRC, 'store/sqlite.ts'), 'utf8')
		// An entry's type follows its author in every `#appendIn` call; a channel's type does not.
		const written = [...store.matchAll(/author(?:: [^,]+)?,\s*type: '(cynapse\.[^']+)'/g)].map((m) => m[1] as string)
		expect(written.length).toBeGreaterThan(10)
		expect(sorted(firstColumn('Entry types'))).toEqual(sorted(written))
	})

	it('lists every reserved tag', () => {
		expect(firstColumn('Reserved tags')).toEqual([HANDLED_TAG])
	})

	it('lists every exit code with its value', () => {
		const page = readFileSync(PAGE, 'utf8')
		const documented = Object.fromEntries(
			[...page.matchAll(/^\| `(\d+)` \| `(EXIT_[A-Z_]+)` \|/gm)].map((m) => [m[2], Number(m[1])]),
		)
		const exported = Object.fromEntries(Object.entries(cliError).filter(([name]) => name.startsWith('EXIT_')))
		expect(documented).toEqual(exported)
	})

	it('lists every error code the source raises', () => {
		const raised = sourceFiles(SRC).flatMap((file) =>
			[...readFileSync(file, 'utf8').matchAll(/\bcode: '([a-z_]+)'/g)].map((m) => m[1] as string),
		)
		// `errorCodeFor` gives an uncoded failure one of these two.
		expect(sorted(firstColumn('Error codes'))).toEqual(sorted([...raised, 'usage', 'failure']))
	})
})
