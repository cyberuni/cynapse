import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CynapseError, EXIT_USAGE } from '../cli-error.js'
import { setOutputFormat } from '../output.js'
import { createProgram } from '../program.js'

let dir: string
let db: string
let log: { mock: { calls: unknown[][] }; mockClear(): void }

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'cynapse-cli-'))
	db = join(dir, 'test.db')
	log = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
	setOutputFormat('text')
	vi.restoreAllMocks()
	rmSync(dir, { recursive: true, force: true })
})

/** Runs one CLI invocation against the test database and returns what it printed. */
async function cli(...args: string[]): Promise<string> {
	log.mockClear()
	setOutputFormat('text')
	await createProgram('0.0.0').parseAsync(['node', 'cynapse', '--db', db, ...args])
	return log.mock.calls.map((call: unknown[]) => String(call[0])).join('\n')
}

async function json<T = any>(...args: string[]): Promise<T> {
	return JSON.parse(await cli('--json', ...args)) as T
}

describe('cynapse channel', () => {
	it('creates a channel and shows the briefing in one call', async () => {
		await cli(
			'--as',
			'alice',
			'channel',
			'create',
			'auth',
			'--type',
			'sdd.mission',
			'--title',
			'Add auth',
			'--purpose',
			'ship login',
			'--member',
			'bob:reviewer',
			'--context',
			'gh:cyberuni/cynapse#12',
			'--convention',
			'sdd.ledger',
		)
		const brief = await json('--as', 'bob', 'channel', 'show', 'auth')
		expect(brief.channel).toMatchObject({
			handle: 'auth',
			purpose: 'ship login',
			members: [{ participant: 'bob', role: 'reviewer', cursor: 0 }],
			context: ['gh:cyberuni/cynapse#12'],
			conventions: ['sdd.ledger'],
			stats: { unread: 3 },
		})
		expect(await cli('channel', 'show', 'auth')).toContain(
			'context: [cyberuni/cynapse#12](https://github.com/cyberuni/cynapse/issues/12)',
		)
	})

	it('lists and draws the tree of anchored children', async () => {
		await cli('--as', 'a', 'channel', 'create', 'epic', '--type', 'sdd.epic', '--title', 'Epic')
		await cli('--as', 'a', 'entry', 'append', 'epic', '--type', 'sdd.mission.opened', '--body', 'm1')
		await cli('--as', 'a', 'channel', 'create', 'm1', '--type', 'sdd.mission', '--title', 'M1', '--anchor', 'epic#2')
		expect(await cli('channel', 'tree')).toMatch(/^epic .*\n {2}m1 /)
		expect((await json('channel', 'list', '--parent', 'epic')).items.map((s: any) => s.handle)).toEqual(['m1'])
	})

	it('names what was empty', async () => {
		expect(await cli('channel', 'list')).toBe('0 channels found')
	})
})

describe('cynapse entry', () => {
	beforeEach(async () => {
		await cli('--as', 'alice', 'channel', 'create', 'auth', '--type', 'sdd.mission', '--title', 'Add auth')
	})

	it('appends and shows an entry by its short reference, rendering refs', async () => {
		const appended = await json(
			'--as',
			'alice',
			'entry',
			'append',
			'auth',
			'--type',
			'sdd.decision',
			'--body',
			'use JWT',
			'--ref',
			'gh:cyberuni/cynapse#12',
			'--tag',
			'sdd.risk',
			'--data',
			'{"choice":"jwt"}',
		)
		expect(appended).toMatchObject({ seq: 2, tags: ['sdd.risk'], data: { choice: 'jwt' } })
		const shown = await json('entry', 'show', 'auth#2')
		expect(shown.links[0].url).toBe('https://github.com/cyberuni/cynapse/issues/12')
		expect(await cli('entry', 'show', 'auth#2')).toContain('use JWT')
	})

	it('is idempotent on --id', async () => {
		const first = await json('--as', 'alice', 'entry', 'append', 'auth', '--type', 'note', '--body', 'x')
		await cli('--as', 'alice', 'entry', 'append', 'auth', '--type', 'note', '--body', 'x', '--id', first.id)
		expect((await json('entry', 'list', 'auth')).count).toBe(2)
	})

	it('lists unread, meta-only, by type and by tag, and advances with read', async () => {
		await cli('--as', 'alice', 'entry', 'append', 'auth', '--type', 'note', '--body', 'hello')
		await cli('--as', 'alice', 'entry', 'append', 'auth', '--type', 'sdd.decision', '--body', 'd')
		await cli('--as', 'bob', 'tag', 'auth#3', 'sdd.key')
		expect((await json('--as', 'bob', 'entry', 'list', 'auth', '--unread')).count).toBe(3)
		expect((await json('entry', 'list', 'auth', '--meta-only')).items[1].body).toBe('')
		expect((await json('entry', 'list', 'auth', '--type', 'sdd.*')).count).toBe(1)
		expect((await json('entry', 'list', 'auth', '--tag', 'sdd.key')).items[0].seq).toBe(3)
		await cli('--as', 'bob', 'read', 'auth')
		expect(await cli('--as', 'bob', 'entry', 'list', 'auth', '--unread')).toBe('0 unread entries found')
	})

	it('requires a participant for a write', async () => {
		vi.stubEnv('CYNAPSE_PARTICIPANT', '')
		const error = await cli('entry', 'append', 'auth', '--type', 'note').catch((e: unknown) => e)
		expect(error).toBeInstanceOf(CynapseError)
		expect((error as CynapseError).exitCode).toBe(EXIT_USAGE)
		vi.unstubAllEnvs()
	})

	it('fails with a named error for an unknown channel', async () => {
		await expect(cli('entry', 'list', 'nope')).rejects.toThrow('no channel found for "nope"')
	})
})

describe('cynapse state', () => {
	it('sets, lists and resolves a needs-input record, and sets the lifecycle', async () => {
		await cli('--as', 'a', 'channel', 'create', 'arb', '--type', 'truss.arbitration', '--title', 'Arb')
		await cli(
			'--as',
			'a',
			'state',
			'set',
			'arb',
			'escalation',
			'--kind',
			'needs-input',
			'--status',
			'open',
			'--subject',
			'council',
		)
		expect((await json('state', 'list', '--subject', 'council', '--status', 'open')).count).toBe(1)
		await cli('--as', 'council', 'state', 'set', 'arb', 'escalation', '--kind', 'needs-input', '--status', 'resolved')
		expect(await cli('state', 'list', '--status', 'open')).toBe('0 state records found')
		await cli('--as', 'a', 'state', 'lifecycle', 'arb', 'reconciled')
		expect((await json('channel', 'show', 'arb')).channel.state).toBe('reconciled')
	})
})
