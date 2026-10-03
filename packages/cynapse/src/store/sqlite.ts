import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { isDeepStrictEqual } from 'node:util'
import { CynapseError } from '../cli-error.js'
import { isUuid, timestampOf, uuidv5, uuidv7 } from '../ids.js'
import { SCHEMA } from './schema.js'
import type {
	AppendInput,
	Briefing,
	Channel,
	ChannelTraits,
	ChannelTree,
	CreateChannelInput,
	Entry,
	EntryQuery,
	ListChannelsQuery,
	Member,
	Participant,
	ParticipantKind,
	SearchQuery,
	SetStateInput,
	StateQuery,
	StateRecord,
	StateStatus,
	Store,
	View,
	ViewFilter,
} from './types.js'

export interface SqliteStoreOptions {
	path: string
	/** Milliseconds since the epoch. Overridable so a seed can lay out a realistic timeline. */
	clock?: () => number
	/** How long a writer waits for the write lock before failing. */
	busyTimeoutMs?: number
}

const DEFAULT_TRAITS: ChannelTraits = { membership: 'open', wake: false }

interface ChannelRow {
	id: string
	handle: string
	type: string
	title: string
	purpose: string | null
	parent_channel: string | null
	parent_entry: string | null
	traits: string
	state: string
	conventions: string
	created_at: string
}

interface EntryRow {
	id: string
	channel: string
	handle: string
	seq: number
	author: string
	type: string
	parent: string | null
	parent_seq: number | null
	root: string | null
	root_seq: number | null
	refs: string
	write_tags: string
	body: string
	data: string | null
	recorded_at: string
}

interface StateRow {
	channel: string
	key: string
	kind: string
	status: string
	subject: string | null
	entry: string | null
	value: string | null
	seq: number
	updated_at: string
}

const ENTRY_SELECT = `
	SELECT e.id, e.channel, s.handle, e.seq, e.author, e.type, e.parent, p.seq AS parent_seq,
		e.root, r.seq AS root_seq, e.refs, e.tags AS write_tags, e.body, e.data, e.recorded_at
	FROM entries e
	JOIN channels s ON s.id = e.channel
	LEFT JOIN entries p ON p.id = e.parent
	LEFT JOIN entries r ON r.id = e.root`

/**
 * The solo-tier store: stock SQLite in WAL mode, embedded, with no daemon.
 *
 * SQLite's write lock is the order owner. Every write runs in `BEGIN IMMEDIATE`, which
 * takes the lock up front, and assigns `seq` inside that transaction as the channel's last
 * seq + 1 — so concurrent CLI processes can never hand out the same seq or leave a gap.
 */
export class SqliteStore implements Store {
	readonly #db: DatabaseSync
	readonly #clock: () => number

	constructor(options: SqliteStoreOptions) {
		if (options.path !== ':memory:') mkdirSync(dirname(options.path), { recursive: true })
		this.#db = new DatabaseSync(options.path)
		this.#clock = options.clock ?? Date.now
		this.#db.exec(`PRAGMA busy_timeout = ${options.busyTimeoutMs ?? 10_000}`)
		this.#db.exec('PRAGMA journal_mode = WAL')
		this.#db.exec('PRAGMA synchronous = NORMAL')
		this.#db.exec('PRAGMA foreign_keys = ON')
		this.#write(() => this.#db.exec(SCHEMA))
	}

	close(): void {
		this.#db.close()
	}

	/** SQLite's own consistency check; `ok` when the file is sound. */
	integrityCheck(): string {
		return this.#all<{ integrity_check: string }>('PRAGMA integrity_check')
			.map((row) => row.integrity_check)
			.join('; ')
	}

	// ── participants ────────────────────────────────────────────────────────────

	addParticipant(participant: Participant): Participant {
		this.#write(() =>
			this.#run(
				`INSERT INTO participants (id, kind, name) VALUES (?, ?, ?)
				ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, name = excluded.name`,
				participant.id,
				participant.kind,
				participant.name,
			),
		)
		return participant
	}

	participants(): Participant[] {
		return this.#all<{ id: string; kind: ParticipantKind; name: string }>(
			'SELECT id, kind, name FROM participants ORDER BY id',
		)
	}

	// ── channels ─────────────────────────────────────────────────────────────────

	createChannel(input: CreateChannelInput): Channel {
		const id = this.#write(() => {
			const anchor = input.anchor ? this.#requireEntryRow(input.anchor) : undefined
			const id = anchor ? uuidv5(anchor.id) : input.key ? uuidv5(input.key) : uuidv7(this.#clock())
			// A derived id makes creation idempotent: two agents opening the same channel at
			// once end up in one channel, not two.
			if (this.#get('SELECT 1 AS found FROM channels WHERE id = ?', id)) {
				const field = this.#createConflict(id, input)
				if (field) {
					throw new CynapseError(
						`channel id ${id} (derived from the ${anchor ? 'anchor' : 'key'}) already exists and differs in ${field}`,
						{
							code: 'id_conflict',
						},
					)
				}
				return id
			}
			const taken = this.#findChannelId(input.handle)
			if (taken) throw new CynapseError(`channel handle "${input.handle}" is already taken`)
			validateHandle(input.handle)
			this.#ensureParticipant(input.author)
			const traits = { ...DEFAULT_TRAITS, ...input.traits }
			this.#run(
				`INSERT INTO channels (id, handle, type, title, purpose, parent_channel, parent_entry, traits, state,
					conventions, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				id,
				input.handle,
				input.type,
				input.title,
				input.purpose ?? null,
				anchor?.channel ?? null,
				anchor?.id ?? null,
				JSON.stringify(traits),
				input.state ?? 'active',
				JSON.stringify(input.conventions ?? []),
				this.#now(),
			)
			this.#run('INSERT INTO channel_handles (handle, channel) VALUES (?, ?)', input.handle, id)
			this.#appendIn(id, {
				author: input.author,
				type: 'cynapse.channel.created',
				data: {
					handle: input.handle,
					type: input.type,
					title: input.title,
					...(input.purpose ? { purpose: input.purpose } : {}),
					...(anchor ? { anchor: anchor.id } : {}),
				},
			})
			return id
		})
		return this.#requireChannel(id)
	}

	/**
	 * The first field in which a repeated create of a derived-id channel differs from the
	 * stored channel. A handle still matches after a rename, since the old one is an alias.
	 */
	#createConflict(id: string, input: CreateChannelInput): string | undefined {
		const stored = this.#get<ChannelRow>('SELECT * FROM channels WHERE id = ?', id) as ChannelRow
		if (this.#findChannelId(input.handle) !== id) return 'handle'
		if (stored.type !== input.type) return 'type'
		if (stored.title !== input.title) return 'title'
		if (!isDeepStrictEqual(JSON.parse(stored.traits), { ...DEFAULT_TRAITS, ...input.traits })) return 'traits'
		return undefined
	}

	getChannel(ref: string, options: { as?: string } = {}): Channel | undefined {
		const id = this.#findChannelId(ref)
		return id ? this.#loadChannel(id, options.as) : undefined
	}

	listChannels(query: ListChannelsQuery = {}): Channel[] {
		const where: string[] = []
		const params: SQLInputValue[] = []
		if (query.type) {
			where.push('type = ?')
			params.push(query.type)
		}
		if (query.state) {
			where.push('state = ?')
			params.push(query.state)
		}
		if (query.parent) {
			where.push('parent_channel = ?')
			params.push(this.#requireChannelId(query.parent))
		}
		const rows = this.#all<{ id: string }>(
			`SELECT id FROM channels ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at, id`,
			...params,
		)
		return rows.map((row) => this.#loadChannel(row.id))
	}

	children(ref: string): Channel[] {
		return this.listChannels({ parent: ref })
	}

	tree(ref?: string): ChannelTree[] {
		const build = (channel: Channel): ChannelTree => ({
			channel,
			children: this.children(channel.id).map(build),
		})
		if (ref) return [build(this.#requireChannel(this.#requireChannelId(ref)))]
		const roots = this.#all<{ id: string }>(
			'SELECT id FROM channels WHERE parent_channel IS NULL ORDER BY created_at, id',
		)
		return roots.map((row) => build(this.#loadChannel(row.id)))
	}

	brief(ref: string, options: { as?: string } = {}): Briefing {
		const channel = this.#requireChannel(this.#requireChannelId(ref), options.as)
		const pinned = channel.pinned
			.map((seq) => this.entry(channel.id, seq))
			.filter((entry): entry is Entry => entry !== undefined)
		return {
			channel,
			states: this.states({ channel: channel.id, status: 'open' }),
			pinned,
			views: this.views(channel.id),
			children: this.children(channel.id).map(({ id, handle, type, title, state }) => ({
				id,
				handle,
				type,
				title,
				state,
			})),
		}
	}

	renameChannel(ref: string, handle: string, author: string): Channel {
		const id = this.#write(() => {
			const id = this.#requireChannelId(ref)
			validateHandle(handle)
			const owner = this.#findChannelId(handle)
			if (owner && owner !== id) throw new CynapseError(`channel handle "${handle}" is already taken`)
			const from = this.#get<{ handle: string }>('SELECT handle FROM channels WHERE id = ?', id)?.handle
			if (from === handle) return id
			this.#run('UPDATE channels SET handle = ? WHERE id = ?', handle, id)
			this.#run('INSERT OR IGNORE INTO channel_handles (handle, channel) VALUES (?, ?)', handle, id)
			this.#appendIn(id, { author, type: 'cynapse.channel.renamed', data: { from, to: handle } })
			return id
		})
		return this.#requireChannel(id)
	}

	addMember(ref: string, participant: string, role: string, author: string): Entry {
		return this.#writeEntry(() => {
			const id = this.#requireChannelId(ref)
			this.#ensureParticipant(participant)
			this.#run(
				`INSERT INTO members (channel, participant, role) VALUES (?, ?, ?)
				ON CONFLICT (channel, participant) DO UPDATE SET role = excluded.role`,
				id,
				participant,
				role,
			)
			return this.#appendIn(id, { author, type: 'cynapse.member.joined', data: { participant, role } })
		})
	}

	addContext(ref: string, contextRef: string, author: string): Entry {
		return this.#writeEntry(() => {
			const id = this.#requireChannelId(ref)
			this.#run('INSERT OR IGNORE INTO context (channel, ref) VALUES (?, ?)', id, contextRef)
			return this.#appendIn(id, {
				author,
				type: 'cynapse.context.added',
				refs: [contextRef],
				data: { ref: contextRef },
			})
		})
	}

	pin(entryRef: string, author: string): Entry {
		return this.#writeEntry(() => {
			const target = this.#requireEntryRow(entryRef)
			this.#run('INSERT OR IGNORE INTO pins (channel, entry) VALUES (?, ?)', target.channel, target.id)
			return this.#appendIn(target.channel, {
				author,
				type: 'cynapse.pinned',
				refs: [`${target.handle}#${target.seq}`],
				data: { target: target.id, seq: target.seq },
			})
		})
	}

	setLifecycle(ref: string, state: string, author: string): Entry {
		return this.#writeEntry(() => {
			const id = this.#requireChannelId(ref)
			const from = this.#get<{ state: string }>('SELECT state FROM channels WHERE id = ?', id)?.state
			this.#run('UPDATE channels SET state = ? WHERE id = ?', state, id)
			return this.#appendIn(id, {
				author,
				type: 'cynapse.state.changed',
				data: { key: 'lifecycle', kind: 'lifecycle', from, to: state },
			})
		})
	}

	defineView(ref: string, name: string, filter: ViewFilter, author: string): Entry {
		return this.#writeEntry(() => {
			const id = this.#requireChannelId(ref)
			this.#run(
				`INSERT INTO views (channel, name, filter) VALUES (?, ?, ?)
				ON CONFLICT (channel, name) DO UPDATE SET filter = excluded.filter`,
				id,
				name,
				JSON.stringify(filter),
			)
			return this.#appendIn(id, { author, type: 'cynapse.view.defined', data: { name, filter } })
		})
	}

	views(ref: string): View[] {
		const id = this.#requireChannelId(ref)
		return this.#all<{ channel: string; name: string; filter: string }>(
			'SELECT channel, name, filter FROM views WHERE channel = ? ORDER BY name',
			id,
		).map((row) => ({ channelId: row.channel, name: row.name, filter: JSON.parse(row.filter) as ViewFilter }))
	}

	// ── entries ─────────────────────────────────────────────────────────────────

	append(ref: string, input: AppendInput): Entry {
		return this.#writeEntry(() => this.#appendIn(this.#requireChannelId(ref), input))
	}

	entry(ref: string, seq?: number): Entry | undefined {
		const row =
			seq === undefined
				? this.#findEntryRow(ref)
				: this.#get<EntryRow>(`${ENTRY_SELECT} WHERE e.channel = ? AND e.seq = ?`, this.#findChannelId(ref) ?? '', seq)
		return row ? this.#toEntry(row) : undefined
	}

	entries(ref: string, query: EntryQuery = {}): Entry[] {
		const id = this.#requireChannelId(ref)
		const where = ['e.channel = ?']
		const params: SQLInputValue[] = [id]
		let filter: ViewFilter = query
		if (query.view) {
			const view = this.#get<{ filter: string }>(
				'SELECT filter FROM views WHERE channel = ? AND name = ?',
				id,
				query.view,
			)
			if (!view) throw new CynapseError(`no view named "${query.view}" on channel ${ref}`)
			filter = mergeFilters(JSON.parse(view.filter) as ViewFilter, query)
		}
		applyFilter(filter, where, params)
		if (query.afterSeq !== undefined) {
			where.push('e.seq > ?')
			params.push(query.afterSeq)
		}
		if (query.unreadFor) {
			where.push('e.seq > ? AND e.author <> ?')
			params.push(this.#cursor(id, query.unreadFor), query.unreadFor)
		}
		if (query.fromSummary) {
			const summary = this.#get<{ seq: number }>(
				"SELECT MAX(seq) AS seq FROM entries WHERE channel = ? AND type = 'cynapse.summary'",
				id,
			)
			if (summary?.seq) {
				where.push('e.seq >= ?')
				params.push(summary.seq)
			}
		}
		if (query.root) {
			const root = this.#requireEntryRow(query.root)
			where.push('(e.id = ? OR e.root = ?)')
			params.push(root.id, root.id)
		}
		const limit = query.limit ? `LIMIT ${Math.max(0, Math.trunc(query.limit))}` : ''
		return this.#all<EntryRow>(`${ENTRY_SELECT} WHERE ${where.join(' AND ')} ORDER BY e.seq ${limit}`, ...params).map(
			(row) => this.#toEntry(row, query.metaOnly),
		)
	}

	search(query: SearchQuery = {}): Entry[] {
		const where: string[] = []
		const params: SQLInputValue[] = []
		applyFilter(query, where, params)
		if (query.channels?.length) {
			const ids = query.channels.map((ref) => this.#requireChannelId(ref))
			where.push(`e.channel IN (${ids.map(() => '?').join(', ')})`)
			params.push(...ids)
		}
		const limit = query.limit ? `LIMIT ${Math.max(0, Math.trunc(query.limit))}` : ''
		return this.#all<EntryRow>(
			`${ENTRY_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY e.id ${limit}`,
			...params,
		).map((row) => this.#toEntry(row, query.metaOnly))
	}

	addTags(entryRef: string, tags: string[], author: string): Entry {
		return this.#label(entryRef, tags, [], author)
	}

	removeTags(entryRef: string, tags: string[], author: string): Entry {
		return this.#label(entryRef, [], tags, author)
	}

	// ── read state ──────────────────────────────────────────────────────────────

	markRead(ref: string, participant: string, seq?: number): Member {
		return this.#write(() => {
			const id = this.#requireChannelId(ref)
			const last = this.#lastSeq(id)
			const target = Math.min(seq ?? last, last)
			this.#ensureParticipant(participant)
			// A cursor only moves forward; re-reading old entries must not mark newer ones unread.
			this.#run(
				`INSERT INTO cursors (channel, participant, seq) VALUES (?, ?, ?)
				ON CONFLICT (channel, participant) DO UPDATE SET seq = MAX(seq, excluded.seq)`,
				id,
				participant,
				target,
			)
			const role = this.#get<{ role: string }>(
				'SELECT role FROM members WHERE channel = ? AND participant = ?',
				id,
				participant,
			)?.role
			return { participant, role: role ?? 'reader', cursor: this.#cursor(id, participant) }
		})
	}

	unread(participant: string): { channelId: string; handle: string; count: number }[] {
		return this.#all<{ channelId: string; handle: string; count: number }>(
			`SELECT s.id AS channelId, s.handle AS handle, COUNT(e.id) AS count
			FROM members m
			JOIN channels s ON s.id = m.channel
			LEFT JOIN cursors c ON c.channel = m.channel AND c.participant = m.participant
			JOIN entries e ON e.channel = m.channel AND e.seq > COALESCE(c.seq, 0) AND e.author <> m.participant
			WHERE m.participant = ?
			GROUP BY s.id
			ORDER BY s.handle`,
			participant,
		)
	}

	// ── state records ───────────────────────────────────────────────────────────

	setState(ref: string, input: SetStateInput, author: string): StateRecord {
		return this.#write(() => {
			const id = this.#requireChannelId(ref)
			if (input.kind === 'lifecycle') throw new CynapseError('lifecycle is set with setLifecycle, not setState')
			const previous = this.#get<StateRow>('SELECT * FROM states WHERE channel = ? AND key = ?', id, input.key)
			const entryId = input.entryId ? this.#requireEntryRow(input.entryId).id : undefined
			const logged = this.#appendIn(id, {
				author,
				type: 'cynapse.state.changed',
				data: {
					key: input.key,
					kind: input.kind,
					from: previous?.status,
					to: input.status,
					...(input.subject ? { subject: input.subject } : {}),
					...(entryId ? { entry: entryId } : {}),
					...(input.value === undefined ? {} : { value: input.value }),
				},
			})
			this.#run(
				`INSERT INTO states (channel, key, kind, status, subject, entry, value, seq, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT (channel, key) DO UPDATE SET kind = excluded.kind, status = excluded.status,
					subject = excluded.subject, entry = excluded.entry, value = excluded.value, seq = excluded.seq,
					updated_at = excluded.updated_at`,
				id,
				input.key,
				input.kind,
				input.status,
				input.subject ?? null,
				entryId ?? null,
				input.value === undefined ? null : JSON.stringify(input.value),
				logged.seq,
				logged.recordedAt,
			)
			return this.#toState(
				this.#get<StateRow>('SELECT * FROM states WHERE channel = ? AND key = ?', id, input.key) as StateRow,
			)
		})
	}

	states(query: StateQuery = {}): StateRecord[] {
		const where: string[] = []
		const params: SQLInputValue[] = []
		if (query.channel) {
			where.push('channel = ?')
			params.push(this.#requireChannelId(query.channel))
		}
		for (const field of ['kind', 'status', 'subject'] as const) {
			const value = query[field]
			if (value) {
				where.push(`${field} = ?`)
				params.push(value)
			}
		}
		return this.#all<StateRow>(
			`SELECT * FROM states ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at, channel, key`,
			...params,
		).map((row) => this.#toState(row))
	}

	// ── internals ───────────────────────────────────────────────────────────────

	/**
	 * Runs `fn` under the write lock. `BEGIN IMMEDIATE` takes the lock before the first
	 * read, so the seq read inside cannot be stale by the time it is written.
	 */
	#write<T>(fn: () => T): T {
		if (this.#db.isTransaction) return fn()
		this.#db.exec('BEGIN IMMEDIATE')
		try {
			const result = fn()
			this.#db.exec('COMMIT')
			return result
		} catch (error) {
			this.#db.exec('ROLLBACK')
			throw error
		}
	}

	#writeEntry(fn: () => Entry): Entry {
		const id = this.#write(() => fn().id)
		return this.entry(id) as Entry
	}

	#appendIn(channelId: string, input: AppendInput): Entry {
		if (input.id) {
			if (!isUuid(input.id)) throw new CynapseError(`entry id "${input.id}" is not a UUID`)
			const existing = this.#findEntryRow(input.id)
			if (existing) {
				// Same id with the same payload is a retry, not a new entry. Same id with a
				// different payload is a collision, and returning the stored entry would hide it.
				const field = this.#appendConflict(existing, channelId, input)
				if (field) {
					throw new CynapseError(
						`entry id ${input.id} is already used by ${existing.handle}#${existing.seq}, which differs in ${field}`,
						{ code: 'id_conflict' },
					)
				}
				return this.#toEntry(existing)
			}
		}
		const id = input.id ?? uuidv7(this.#clock())
		let root: string | null = null
		let parent: string | null = null
		if (input.parent) {
			const parentRow = this.#requireEntryRow(input.parent)
			if (parentRow.channel !== channelId) {
				throw new CynapseError(`parent ${input.parent} is in another channel; replies stay in one channel`)
			}
			parent = parentRow.id
			root = parentRow.root ?? parentRow.id
		}
		this.#ensureParticipant(input.author)
		const seq = this.#lastSeq(channelId) + 1
		this.#run(
			`INSERT INTO entries (id, channel, seq, author, type, parent, root, refs, tags, body, data, recorded_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			id,
			channelId,
			seq,
			input.author,
			input.type,
			parent,
			root,
			JSON.stringify(input.refs ?? []),
			JSON.stringify(normalizeTags(input.tags)),
			input.body ?? '',
			input.data === undefined ? null : JSON.stringify(input.data),
			this.#now(),
		)
		for (const tag of normalizeTags(input.tags)) {
			this.#run('INSERT INTO entry_tags (entry, tag) VALUES (?, ?)', id, tag)
		}
		return this.#toEntry(this.#findEntryRow(id) as EntryRow)
	}

	/** The first field in which a retried append differs from the stored entry, if any. */
	#appendConflict(existing: EntryRow, channelId: string, input: AppendInput): string | undefined {
		const parent = input.parent ? this.#requireEntryRow(input.parent).id : null
		const checks: [string, unknown, unknown][] = [
			['channel', existing.channel, channelId],
			['author', existing.author, input.author],
			['type', existing.type, input.type],
			['parent', existing.parent, parent],
			['body', existing.body, input.body ?? ''],
			['data', existing.data === null ? undefined : JSON.parse(existing.data), input.data],
			// Compared with the tags given at write time; labels added since do not count.
			['tags', JSON.parse(existing.write_tags), normalizeTags(input.tags)],
			['refs', JSON.parse(existing.refs), input.refs ?? []],
		]
		return checks.find(([, stored, given]) => !isDeepStrictEqual(stored, given))?.[0]
	}

	/**
	 * A tag added or removed later is a `cynapse.label` entry. The `entry_tags` table is
	 * the current set folded from those entries, kept up to date in the same transaction.
	 */
	#label(entryRef: string, add: string[], remove: string[], author: string): Entry {
		return this.#writeEntry(() => {
			const target = this.#requireEntryRow(entryRef)
			for (const tag of add) this.#run('INSERT OR IGNORE INTO entry_tags (entry, tag) VALUES (?, ?)', target.id, tag)
			for (const tag of remove) this.#run('DELETE FROM entry_tags WHERE entry = ? AND tag = ?', target.id, tag)
			return this.#appendIn(target.channel, {
				author,
				type: 'cynapse.label',
				refs: [`${target.handle}#${target.seq}`],
				data: { target: target.id, ...(add.length ? { add } : {}), ...(remove.length ? { remove } : {}) },
			})
		})
	}

	#lastSeq(channelId: string): number {
		return (
			this.#get<{ seq: number | null }>('SELECT MAX(seq) AS seq FROM entries WHERE channel = ?', channelId)?.seq ?? 0
		)
	}

	#cursor(channelId: string, participant: string): number {
		return (
			this.#get<{ seq: number }>(
				'SELECT seq FROM cursors WHERE channel = ? AND participant = ?',
				channelId,
				participant,
			)?.seq ?? 0
		)
	}

	#ensureParticipant(id: string): void {
		this.#run("INSERT OR IGNORE INTO participants (id, kind, name) VALUES (?, 'agent', ?)", id, id)
	}

	#findChannelId(ref: string): string | undefined {
		if (isUuid(ref)) {
			const row = this.#get<{ id: string }>('SELECT id FROM channels WHERE id = ?', ref.toLowerCase())
			if (row) return row.id
		}
		return this.#get<{ channel: string }>('SELECT channel FROM channel_handles WHERE handle = ?', ref)?.channel
	}

	#requireChannelId(ref: string): string {
		const id = this.#findChannelId(ref)
		if (!id) throw new CynapseError(`no channel found for "${ref}"`)
		return id
	}

	#requireChannel(id: string, as?: string): Channel {
		return this.#loadChannel(id, as)
	}

	#findEntryRow(ref: string): EntryRow | undefined {
		if (isUuid(ref)) return this.#get<EntryRow>(`${ENTRY_SELECT} WHERE e.id = ?`, ref.toLowerCase())
		const short = /^(.+)#(\d+)$/.exec(ref)
		if (!short) return undefined
		const channelId = this.#findChannelId(short[1] as string)
		if (!channelId) return undefined
		return this.#get<EntryRow>(`${ENTRY_SELECT} WHERE e.channel = ? AND e.seq = ?`, channelId, Number(short[2]))
	}

	#requireEntryRow(ref: string): EntryRow {
		const row = this.#findEntryRow(ref)
		if (!row) throw new CynapseError(`no entry found for "${ref}"`)
		return row
	}

	#loadChannel(id: string, as?: string): Channel {
		const row = this.#get<ChannelRow>('SELECT * FROM channels WHERE id = ?', id)
		if (!row) throw new CynapseError(`no channel found for "${id}"`)
		const aliases = this.#all<{ handle: string }>(
			'SELECT handle FROM channel_handles WHERE channel = ? AND handle <> ? ORDER BY handle',
			id,
			row.handle,
		).map((alias) => alias.handle)
		const members = this.#all<Member>(
			`SELECT m.participant, m.role, COALESCE(c.seq, 0) AS cursor
			FROM members m LEFT JOIN cursors c ON c.channel = m.channel AND c.participant = m.participant
			WHERE m.channel = ? ORDER BY m.rowid`,
			id,
		)
		const context = this.#all<{ ref: string }>('SELECT ref FROM context WHERE channel = ? ORDER BY rowid', id).map(
			(c) => c.ref,
		)
		const pinned = this.#all<{ seq: number }>(
			'SELECT e.seq FROM pins p JOIN entries e ON e.id = p.entry WHERE p.channel = ? ORDER BY e.seq',
			id,
		).map((p) => p.seq)
		const stats = this.#get<{ entries: number; lastSeq: number | null; lastAt: string | null }>(
			'SELECT COUNT(*) AS entries, MAX(seq) AS lastSeq, MAX(recorded_at) AS lastAt FROM entries WHERE channel = ?',
			id,
		)
		let parent: Channel['parent']
		if (row.parent_entry && row.parent_channel) {
			const anchorSeq = this.#get<{ seq: number }>('SELECT seq FROM entries WHERE id = ?', row.parent_entry)?.seq ?? 0
			parent = { channelId: row.parent_channel, entryId: row.parent_entry, seq: anchorSeq }
		}
		const lastSeq = stats?.lastSeq ?? 0
		let unread: number | undefined
		if (as) {
			unread =
				this.#get<{ count: number }>(
					'SELECT COUNT(*) AS count FROM entries WHERE channel = ? AND seq > ? AND author <> ?',
					id,
					this.#cursor(id, as),
					as,
				)?.count ?? 0
		}
		return {
			id: row.id,
			handle: row.handle,
			aliases,
			type: row.type,
			title: row.title,
			...(row.purpose ? { purpose: row.purpose } : {}),
			...(parent ? { parent } : {}),
			members,
			context,
			traits: JSON.parse(row.traits) as ChannelTraits,
			state: row.state,
			pinned,
			conventions: JSON.parse(row.conventions) as string[],
			stats: {
				entries: stats?.entries ?? 0,
				lastSeq,
				...(stats?.lastAt ? { lastAt: stats.lastAt } : {}),
				...(unread === undefined ? {} : { unread }),
			},
			createdAt: row.created_at,
		}
	}

	#toEntry(row: EntryRow, metaOnly = false): Entry {
		const tags = this.#all<{ tag: string }>('SELECT tag FROM entry_tags WHERE entry = ? ORDER BY tag', row.id).map(
			(t) => t.tag,
		)
		const created = timestampOf(row.id)
		return {
			id: row.id,
			channelId: row.channel,
			channel: row.handle,
			seq: row.seq,
			author: row.author,
			type: row.type,
			tags,
			...(row.parent ? { parent: row.parent, parentSeq: row.parent_seq ?? undefined } : {}),
			...(row.root ? { root: row.root, rootSeq: row.root_seq ?? undefined } : {}),
			refs: JSON.parse(row.refs) as string[],
			body: metaOnly ? '' : row.body,
			...(!metaOnly && row.data ? { data: JSON.parse(row.data) as Record<string, unknown> } : {}),
			// A writer-supplied id may not be a UUIDv7; fall back to arrival time then.
			createdAt: row.id[14] === '7' && Number.isFinite(created) ? new Date(created).toISOString() : row.recorded_at,
			recordedAt: row.recorded_at,
		}
	}

	#toState(row: StateRow): StateRecord {
		return {
			channelId: row.channel,
			key: row.key,
			kind: row.kind,
			status: row.status as StateStatus,
			...(row.subject ? { subject: row.subject } : {}),
			...(row.entry ? { entryId: row.entry } : {}),
			...(row.value === null ? {} : { value: JSON.parse(row.value) as unknown }),
			seq: row.seq,
			updatedAt: row.updated_at,
		}
	}

	#now(): string {
		return new Date(this.#clock()).toISOString()
	}

	#run(sql: string, ...params: SQLInputValue[]): void {
		this.#db.prepare(sql).run(...params)
	}

	#get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
		return this.#db.prepare(sql).get(...params) as T | undefined
	}

	#all<T>(sql: string, ...params: SQLInputValue[]): T[] {
		return this.#db.prepare(sql).all(...params) as T[]
	}
}

function validateHandle(handle: string): void {
	// `#` separates a handle from a seq in a short reference, and a handle shaped like a
	// UUID would shadow a channel id.
	if (!/^[a-z0-9][a-z0-9._/-]*$/i.test(handle) || isUuid(handle)) {
		throw new CynapseError(`"${handle}" is not a valid channel handle (letters, digits, . _ / -)`)
	}
}

function mergeFilters(view: ViewFilter, extra: ViewFilter): ViewFilter {
	const both = <T>(a?: T[], b?: T[]) => (a && b ? a.filter((x) => b.includes(x)) : (a ?? b))
	return {
		types: both(view.types, extra.types),
		excludeTypes: [...(view.excludeTypes ?? []), ...(extra.excludeTypes ?? [])],
		tags: both(view.tags, extra.tags),
		authors: both(view.authors, extra.authors),
	}
}

function applyFilter(filter: ViewFilter, where: string[], params: SQLInputValue[]): void {
	const typeClause = (type: string) => {
		if (type.endsWith('.*')) {
			params.push(`${type.slice(0, -1)}%`)
			return 'e.type LIKE ?'
		}
		params.push(type)
		return 'e.type = ?'
	}
	if (filter.types?.length) where.push(`(${filter.types.map(typeClause).join(' OR ')})`)
	for (const type of filter.excludeTypes ?? []) where.push(`NOT ${typeClause(type)}`)
	if (filter.tags?.length) {
		where.push(
			`EXISTS (SELECT 1 FROM entry_tags t WHERE t.entry = e.id AND t.tag IN (${filter.tags.map(() => '?').join(', ')}))`,
		)
		params.push(...filter.tags)
	}
	if (filter.authors?.length) {
		where.push(`e.author IN (${filter.authors.map(() => '?').join(', ')})`)
		params.push(...filter.authors)
	}
}

/** Tags as a set, in a stable order, so the same tags given in another order compare equal. */
function normalizeTags(tags: string[] = []): string[] {
	return [...new Set(tags)].sort()
}
