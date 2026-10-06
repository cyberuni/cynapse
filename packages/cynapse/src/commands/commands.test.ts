import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { channelIdOf } from '../channel-key.js'
import {
	CynapseError,
	EXIT_AMBIGUOUS_ADDRESS,
	EXIT_TIMEOUT,
	EXIT_UNKNOWN_ADDRESS,
	EXIT_USAGE,
	renderCliError,
} from '../cli-error.js'
import { uuidv5 } from '../ids.js'
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

describe('cynapse channel, keyed by subject', () => {
	const repo = ['--store', 'gh', '--native-id', 'R_kgDOPfmJ6A']
	const createRepo = (...extra: string[]) =>
		json(
			'--as',
			'legion',
			'channel',
			'create',
			'gh:cyberuni/cynapse',
			'--type',
			'cynapse.repo',
			'--title',
			'cyberuni/cynapse',
			...repo,
			'--kind',
			'address',
			'--owner',
			'unional',
			...extra,
		)

	it('creates an address channel from a store and native id, with its owner in --json', async () => {
		const created = await createRepo()
		expect(created).toMatchObject({
			id: channelIdOf({ store: 'gh', nativeId: 'R_kgDOPfmJ6A' }),
			handle: 'gh:cyberuni/cynapse',
			kind: 'address',
			owner: 'unional',
			subjects: [{ store: 'gh', nativeId: 'R_kgDOPfmJ6A' }],
		})
		expect((await createRepo()).id).toBe(created.id)
		expect((await json('channel', 'list', '--kind', 'address')).count).toBe(1)
		expect(await cli('channel', 'show', 'gh:cyberuni/cynapse')).toContain('address of unional')
	})

	it('defaults to a work channel keyed by its subject', async () => {
		const created = await json(
			'--as',
			'alice',
			'channel',
			'create',
			'gh:cyberuni/cynapse/issues/12',
			'--type',
			'sdd.mission',
			'--title',
			'Add auth',
			'--store',
			'gh',
			'--native-id',
			'I_kwDO12',
		)
		expect(created).toMatchObject({ kind: 'work', subjects: [{ store: 'gh', nativeId: 'I_kwDO12' }] })
		expect(created.owner).toBeUndefined()
	})

	it('registers an address with a minted key when no store is given', async () => {
		const folder = await json(
			'--as',
			'alice',
			'channel',
			'create',
			'notes',
			'--type',
			'cynapse.folder',
			'--title',
			'~/notes',
			'--kind',
			'address',
			'--owner',
			'alice',
		)
		expect(folder).toMatchObject({ kind: 'address', owner: 'alice', subjects: [{ store: 'cynapse' }] })
	})

	it('resolves a channel by store and native id, including an alias key', async () => {
		const created = await createRepo()
		await cli('--as', 'unional', 'channel', 'add-key', 'gh:cyberuni/cynapse', '--store', 'gh', '--native-id', 'R_moved')
		const found = await json('channel', 'resolve', '--store', 'gh', '--native-id', 'R_moved')
		expect(found.id).toBe(created.id)
		await expect(cli('channel', 'resolve', '--store', 'gh', '--native-id', 'R_none')).rejects.toMatchObject({
			code: 'not_found',
		})
	})

	it('changes the owner of an address channel', async () => {
		await createRepo()
		const logged = await json('--as', 'unional', 'channel', 'owner', 'gh:cyberuni/cynapse', 'bob')
		expect(logged).toMatchObject({ type: 'cynapse.channel.owner-changed', data: { from: 'unional', to: 'bob' } })
	})

	it('rejects an unknown kind, an address without an owner and a store without a native id as usage errors', async () => {
		await expect(createRepo('--kind', 'dm')).rejects.toMatchObject({ exitCode: EXIT_USAGE })
		await expect(
			cli('--as', 'a', 'channel', 'create', 'x', '--type', 't', '--title', 'x', '--kind', 'address'),
		).rejects.toMatchObject({ exitCode: EXIT_USAGE })
		await expect(
			cli('--as', 'a', 'channel', 'create', 'x', '--type', 't', '--title', 'x', '--store', 'gh'),
		).rejects.toMatchObject({ exitCode: EXIT_USAGE })
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

	it('excludes by tag and by author, and saves both in a view', async () => {
		await cli('--as', 'alice', 'entry', 'append', 'auth', '--type', 'note', '--body', 'a')
		await cli('--as', 'bob', 'entry', 'append', 'auth', '--type', 'note', '--body', 'b')
		await cli('--as', 'carol', 'entry', 'append', 'auth', '--type', 'note', '--body', 'c')
		await cli('--as', 'alice', 'tag', 'auth#2', 'x.done')
		const bodies = async (...args: string[]) =>
			(await json('entry', 'list', 'auth', '--type', 'note', ...args)).items.map((e: any) => e.body)
		expect(await bodies('--exclude-tag', 'x.done')).toEqual(['b', 'c'])
		expect(await bodies('--exclude-author', 'alice', '--exclude-author', 'bob')).toEqual(['c'])
		await cli(
			'--as',
			'alice',
			'channel',
			'view',
			'auth',
			'open',
			'--exclude-tag',
			'x.done',
			'--exclude-author',
			'carol',
		)
		expect(await bodies('--view', 'open')).toEqual(['b'])
	})

	it('lets only the owner of an address channel tag an entry cynapse.handled', async () => {
		await cli(
			'--as',
			'bob',
			'channel',
			'create',
			'bob-inbox',
			'--type',
			'cynapse.inbox',
			'--title',
			'Bob',
			'--kind',
			'address',
			'--owner',
			'bob',
		)
		await cli('--as', 'alice', 'entry', 'append', 'bob-inbox', '--type', 'note', '--body', 'q?')
		const rejected = await cli('--as', 'alice', 'tag', 'bob-inbox#2', 'cynapse.handled').catch((e: unknown) => e)
		expect(rejected).toMatchObject({ code: 'not_owner', exitCode: 1 })
		expect(await cli('--as', 'bob', 'tag', 'bob-inbox#2', 'cynapse.handled')).toBe('bob-inbox#2 tags: cynapse.handled')
		await expect(cli('--as', 'alice', 'tag', 'bob-inbox#2', '--remove', 'cynapse.handled')).rejects.toMatchObject({
			code: 'not_owner',
		})
		await expect(cli('--as', 'alice', 'tag', 'auth#1', 'cynapse.handled')).rejects.toMatchObject({
			code: 'not_address',
		})
	})

	it('waits for a reply and prints it, or times out with its own exit code', async () => {
		await cli('--as', 'alice', 'entry', 'append', 'auth', '--type', 'note', '--body', 'q?')
		const timedOut = await cli('--as', 'alice', 'entry', 'wait', 'auth#2', '--timeout', '0').catch((e: unknown) => e)
		expect(timedOut).toMatchObject({ code: 'timeout', exitCode: EXIT_TIMEOUT })
		await cli('--as', 'bob', 'entry', 'append', 'auth', '--type', 'note', '--body', 'yes', '--parent', 'auth#2')
		expect(await json('--as', 'alice', 'entry', 'wait', 'auth#2', '--timeout', '0')).toMatchObject({
			seq: 3,
			author: 'bob',
			body: 'yes',
		})
		expect(await cli('--as', 'alice', 'entry', 'wait', 'auth#2', '--timeout', '0')).toContain('auth#3  note  by bob')
	})

	it('rejects a --timeout that is not a number of seconds', async () => {
		const error = await cli('--as', 'alice', 'entry', 'wait', 'auth#1', '--timeout', 'soon').catch((e: unknown) => e)
		expect(error).toMatchObject({ exitCode: EXIT_USAGE })
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
		await expect(cli('entry', 'list', 'nope')).rejects.toMatchObject({ code: 'not_found' })
		await expect(cli('entry', 'show', 'nope#9')).rejects.toMatchObject({ code: 'not_found' })
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

	it.each([
		['list', ['state', 'list', '--status', 'opne']],
		['set', ['--as', 'a', 'state', 'set', 'arb', 'k', '--kind', 'lease', '--status', 'opne']],
	])('rejects an unknown --status on state %s as a usage error', async (_name, args) => {
		const error = await cli(...args).catch((e: unknown) => e)
		expect(error).toBeInstanceOf(CynapseError)
		expect((error as CynapseError).message).toBe('--status must be open or resolved')
		expect((error as CynapseError).exitCode).toBe(EXIT_USAGE)
	})
})

describe('cynapse dev seed', () => {
	it('refuses --reset without an explicit --db, leaving the default database alone', async () => {
		vi.stubEnv('CYNAPSE_HOME', dir)
		const home = join(dir, 'cynapse.db')
		writeFileSync(home, 'real data')
		const error = await createProgram('0.0.0')
			.parseAsync(['node', 'cynapse', 'dev', 'seed', '--reset'])
			.catch((e: unknown) => e)
		expect(error).toBeInstanceOf(CynapseError)
		expect((error as CynapseError).exitCode).toBe(EXIT_USAGE)
		expect((error as CynapseError).message).toMatch(/--db/)
		expect(readFileSync(home, 'utf8')).toBe('real data')
		vi.unstubAllEnvs()
	})

	it('rebuilds an explicit --db with --reset', async () => {
		await cli('dev', 'seed')
		const seeded = await json('dev', 'seed', '--reset')
		expect(seeded.db).toBe(db)
		expect(seeded.channels.length).toBeGreaterThan(0)
	})
})

describe('cynapse changes', () => {
	it('lists every channel without --since, then only what changed after the token', async () => {
		await cli('--as', 'alice', 'channel', 'create', 'auth', '--type', 'sdd.mission', '--title', 'Add auth')
		await cli('--as', 'alice', 'channel', 'create', 'docs', '--type', 'sdd.mission', '--title', 'Docs')
		const all = await json('changes')
		expect(all.items.map((c: any) => c.handle)).toEqual(['auth', 'docs'])
		expect(all.count).toBe(2)

		await cli('--as', 'bob', 'entry', 'append', 'docs', '--type', 'note')
		const next = await json('changes', '--since', all.token)
		expect(next.items).toEqual([expect.objectContaining({ handle: 'docs', lastSeq: 2 })])
		expect(await cli('changes', '--since', all.token)).toBe(`docs  seq 2\ntoken: ${next.token}`)
	})

	it('names what was empty and still gives the token to poll with', async () => {
		await cli('--as', 'alice', 'channel', 'create', 'auth', '--type', 'sdd.mission', '--title', 'Add auth')
		const { token } = await json('changes')
		expect(await json('changes', '--since', token)).toEqual({ count: 0, entity: 'changed channels', items: [], token })
		expect(await cli('changes', '--since', token)).toBe(`0 changed channels found\ntoken: ${token}`)
	})

	it('fails with a coded error for a token it cannot read', async () => {
		await expect(cli('changes', '--since', 'nope')).rejects.toMatchObject({ code: 'invalid_token' })
	})
})

describe('cynapse participant', () => {
	const unit = uuidv5('cyberlegion:unit/1')

	beforeEach(async () => {
		await cli('participant', 'register', 'cyberlegion:unit/1', '--kind', 'service', '--name', 'cyberlegion', '--self')
	})

	function register(key: string, name: string, kind = 'agent') {
		return json('--as', unit, 'participant', 'register', key, '--kind', kind, '--name', name)
	}

	it('registers a participant with its address channel, as the acting unit', async () => {
		const registered = await register('cyberlegion:role/reviewer', 'reviewer')
		expect(registered).toMatchObject({
			participant: {
				id: uuidv5('cyberlegion:role/reviewer'),
				kind: 'agent',
				name: 'reviewer',
				status: 'live',
				registeredBy: unit,
			},
			channel: { handle: 'reviewer', kind: 'address', owner: uuidv5('cyberlegion:role/reviewer') },
		})
		expect(
			await cli(
				'--as',
				unit,
				'participant',
				'register',
				'cyberlegion:role/reviewer',
				'--kind',
				'agent',
				'--name',
				'reviewer',
			),
		).toContain('reviewer')
	})

	it('resolves a name, and lists, retires and renames', async () => {
		const { participant } = await register('cyberlegion:role/reviewer', 'reviewer')
		expect(await json('participant', 'resolve', 'reviewer')).toMatchObject({ participant: { id: participant.id } })

		await cli('--as', unit, 'participant', 'rename', participant.id, 'critic')
		expect(await json('participant', 'resolve', 'reviewer')).toMatchObject({ participant: { name: 'critic' } })

		await cli('--as', unit, 'participant', 'retire', participant.id)
		expect(await json('participant', 'list', '--status', 'retired')).toMatchObject({
			count: 1,
			items: [{ id: participant.id, status: 'retired' }],
		})
		expect(await json('participant', 'list', '--registered-by', unit, '--status', 'live')).toMatchObject({
			count: 1,
			items: [{ id: unit }],
		})
		expect(await cli('participant', 'list', '--status', 'retired')).toContain(
			`${participant.id}  agent  critic  retired`,
		)
	})

	it('fails an ambiguous name with its exit code and every candidate, in text and --json', async () => {
		const first = await register('cyberlegion:role/reviewer', 'reviewer')
		const second = await register('other:role/reviewer', 'reviewer', 'human')

		const error = await cli('participant', 'resolve', 'reviewer').catch((e: unknown) => e)
		expect(error).toMatchObject({ code: 'ambiguous_address', exitCode: EXIT_AMBIGUOUS_ADDRESS })
		const text = renderCliError(error)
		const rendered = JSON.parse(renderCliError(error, 'json'))
		for (const { participant } of [first, second]) {
			expect(text).toContain(participant.id)
			expect(rendered.error.candidates).toContainEqual({
				id: participant.id,
				kind: participant.kind,
				name: 'reviewer',
				registeredBy: unit,
			})
		}
		expect(await json('participant', 'resolve', 'reviewer', '--kind', 'human')).toMatchObject({
			participant: { id: second.participant.id },
		})
	})

	it('fails an unknown name with its exit code', async () => {
		await expect(cli('participant', 'resolve', 'nobody')).rejects.toMatchObject({
			code: 'unknown_address',
			exitCode: EXIT_UNKNOWN_ADDRESS,
		})
	})

	it('rejects an unknown kind or status as a usage error', async () => {
		await expect(register('cyberlegion:role/x', 'x', 'robot')).rejects.toMatchObject({ exitCode: EXIT_USAGE })
		await expect(cli('participant', 'list', '--status', 'gone')).rejects.toMatchObject({ exitCode: EXIT_USAGE })
		await expect(cli('participant', 'resolve', 'x', '--kind', 'robot')).rejects.toMatchObject({ exitCode: EXIT_USAGE })
	})
})

describe('cynapse entry send', () => {
	const unit = uuidv5('cyberlegion:unit/1')

	beforeEach(async () => {
		await cli('participant', 'register', 'cyberlegion:unit/1', '--kind', 'service', '--name', 'cyberlegion', '--self')
		await cli(
			'--as',
			unit,
			'participant',
			'register',
			'cyberlegion:role/reviewer',
			'--kind',
			'agent',
			'--name',
			'reviewer',
		)
	})

	it("appends to the addressee's address channel, resolved by name", async () => {
		const sent = await json('--as', 'alice', 'entry', 'send', 'reviewer', '--type', 'note', '--body', 'please review')
		expect(sent).toMatchObject({ channel: 'reviewer', author: 'alice', body: 'please review' })
		expect(await cli('--as', 'alice', 'entry', 'send', 'reviewer', '--type', 'note', '--body', 'again')).toMatch(
			/^sent reviewer#\d+/,
		)
	})

	it('never creates the addressee: a typo fails with unknown_address and adds no participant', async () => {
		const before = await json('participant', 'list')
		await expect(
			cli('--as', 'alice', 'entry', 'send', 'reviwer', '--type', 'note', '--body', 'hi'),
		).rejects.toMatchObject({ code: 'unknown_address', exitCode: EXIT_UNKNOWN_ADDRESS })
		expect((await json('participant', 'list')).items.map((p: { id: string }) => p.id)).not.toContain('reviwer')
		expect((await json('participant', 'list')).count).toBe(before.count)
	})

	it('does not send to a retired participant', async () => {
		await cli('--as', unit, 'participant', 'retire', uuidv5('cyberlegion:role/reviewer'))
		await expect(cli('--as', 'alice', 'entry', 'send', 'reviewer', '--type', 'note')).rejects.toMatchObject({
			code: 'unknown_address',
		})
	})
})

describe('cynapse entry delete and participant purge', () => {
	const unit = uuidv5('cyberlegion:unit/1')
	const reviewer = uuidv5('cyberlegion:role/reviewer')

	beforeEach(async () => {
		await cli('participant', 'register', 'cyberlegion:unit/1', '--kind', 'service', '--name', 'cyberlegion', '--self')
		await cli(
			'--as',
			unit,
			'participant',
			'register',
			'cyberlegion:role/reviewer',
			'--kind',
			'agent',
			'--name',
			'reviewer',
		)
	})

	it('deletes one entry as the owner, leaving a tombstone that entry list hides', async () => {
		const sent = await json('--as', 'alice', 'entry', 'send', 'reviewer', '--type', 'note', '--body', 'secret')

		expect(await cli('--as', reviewer, 'entry', 'delete', `reviewer#${sent.seq}`)).toMatch(
			new RegExp(`^deleted reviewer#${sent.seq}`),
		)

		expect(await json('entry', 'show', sent.id)).toMatchObject({ body: '', deleted: { by: reviewer } })
		const notes = await json('entry', 'list', 'reviewer', '--type', 'note')
		expect(notes).toMatchObject({ count: 0 })
		expect(await json('entry', 'list', 'reviewer', '--type', 'note', '--include-deleted')).toMatchObject({
			count: 1,
			items: [{ id: sent.id }],
		})
		expect(await cli('entry', 'list', 'reviewer', '--type', 'note', '--include-deleted')).toContain(
			`(deleted by ${reviewer})`,
		)
	})

	it('prints the cynapse.entry.deleted entry under --json, and refuses anyone but the owner', async () => {
		const sent = await json('--as', 'alice', 'entry', 'send', 'reviewer', '--type', 'note', '--body', 'secret')

		await expect(cli('--as', 'alice', 'entry', 'delete', sent.id)).rejects.toMatchObject({ code: 'not_owner' })
		expect(await json('--as', reviewer, 'entry', 'delete', sent.id)).toMatchObject({
			type: 'cynapse.entry.deleted',
			data: { target: sent.id, seq: sent.seq },
		})
	})

	it("purges a retired participant's address channel, as the unit that registered it", async () => {
		await cli('--as', 'alice', 'entry', 'send', 'reviewer', '--type', 'note', '--body', 'one')
		await cli('--as', 'alice', 'entry', 'send', 'reviewer', '--type', 'note', '--body', 'two')
		await expect(cli('--as', unit, 'participant', 'purge', reviewer)).rejects.toThrow(/retire/)
		await cli('--as', unit, 'participant', 'retire', reviewer)

		expect(await cli('--as', unit, 'participant', 'purge', reviewer)).toMatch(
			/^purged 2 entries from reviewer {2}logged reviewer#\d+/,
		)
		expect(await json('entry', 'list', 'reviewer', '--type', 'note')).toMatchObject({ count: 0 })
		expect(await json('--as', unit, 'participant', 'purge', reviewer)).toMatchObject({
			type: 'cynapse.participant.purged',
			data: { participant: reviewer, count: 2 },
		})
	})
})
