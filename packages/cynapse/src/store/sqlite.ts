import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { CynapseError } from '../cli-error.js'
import { isUuid, timestampOf, uuidv5, uuidv7 } from '../ids.js'
import { SCHEMA } from './schema.js'
import type {
	AppendInput,
	Briefing,
	CreateStreamInput,
	Entry,
	EntryQuery,
	ListStreamsQuery,
	Member,
	Participant,
	ParticipantKind,
	SearchQuery,
	SetStateInput,
	StateQuery,
	StateRecord,
	StateStatus,
	Store,
	Stream,
	StreamTraits,
	StreamTree,
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

const DEFAULT_TRAITS: StreamTraits = { membership: 'open', wake: false }

interface StreamRow {
	id: string
	handle: string
	type: string
	title: string
	purpose: string | null
	parent_stream: string | null
	parent_entry: string | null
	traits: string
	state: string
	conventions: string
	created_at: string
}

interface EntryRow {
	id: string
	stream: string
	handle: string
	seq: number
	author: string
	type: string
	parent: string | null
	parent_seq: number | null
	root: string | null
	root_seq: number | null
	refs: string
	body: string
	data: string | null
	recorded_at: string
}

interface StateRow {
	stream: string
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
	SELECT e.id, e.stream, s.handle, e.seq, e.author, e.type, e.parent, p.seq AS parent_seq,
		e.root, r.seq AS root_seq, e.refs, e.body, e.data, e.recorded_at
	FROM entries e
	JOIN streams s ON s.id = e.stream
	LEFT JOIN entries p ON p.id = e.parent
	LEFT JOIN entries r ON r.id = e.root`

/**
 * The solo-tier store: stock SQLite in WAL mode, embedded, with no daemon.
 *
 * SQLite's write lock is the order owner. Every write runs in `BEGIN IMMEDIATE`, which
 * takes the lock up front, and assigns `seq` inside that transaction as the stream's last
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

	// ── streams ─────────────────────────────────────────────────────────────────

	createStream(input: CreateStreamInput): Stream {
		const id = this.#write(() => {
			const anchor = input.anchor ? this.#requireEntryRow(input.anchor) : undefined
			const id = anchor ? uuidv5(anchor.id) : input.key ? uuidv5(input.key) : uuidv7(this.#clock())
			// A derived id makes creation idempotent: two agents opening the same stream at
			// once end up in one stream, not two.
			if (this.#get('SELECT 1 AS found FROM streams WHERE id = ?', id)) return id
			const taken = this.#findStreamId(input.handle)
			if (taken) throw new CynapseError(`stream handle "${input.handle}" is already taken`)
			validateHandle(input.handle)
			this.#ensureParticipant(input.author)
			const traits = { ...DEFAULT_TRAITS, ...input.traits }
			this.#run(
				`INSERT INTO streams (id, handle, type, title, purpose, parent_stream, parent_entry, traits, state,
					conventions, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				id,
				input.handle,
				input.type,
				input.title,
				input.purpose ?? null,
				anchor?.stream ?? null,
				anchor?.id ?? null,
				JSON.stringify(traits),
				input.state ?? 'active',
				JSON.stringify(input.conventions ?? []),
				this.#now(),
			)
			this.#run('INSERT INTO stream_handles (handle, stream) VALUES (?, ?)', input.handle, id)
			this.#appendIn(id, {
				author: input.author,
				type: 'cynapse.stream.created',
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
		return this.#requireStream(id)
	}

	getStream(ref: string, options: { as?: string } = {}): Stream | undefined {
		const id = this.#findStreamId(ref)
		return id ? this.#loadStream(id, options.as) : undefined
	}

	listStreams(query: ListStreamsQuery = {}): Stream[] {
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
			where.push('parent_stream = ?')
			params.push(this.#requireStreamId(query.parent))
		}
		const rows = this.#all<{ id: string }>(
			`SELECT id FROM streams ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at, id`,
			...params,
		)
		return rows.map((row) => this.#loadStream(row.id))
	}

	children(ref: string): Stream[] {
		return this.listStreams({ parent: ref })
	}

	tree(ref?: string): StreamTree[] {
		const build = (stream: Stream): StreamTree => ({
			stream,
			children: this.children(stream.id).map(build),
		})
		if (ref) return [build(this.#requireStream(this.#requireStreamId(ref)))]
		const roots = this.#all<{ id: string }>(
			'SELECT id FROM streams WHERE parent_stream IS NULL ORDER BY created_at, id',
		)
		return roots.map((row) => build(this.#loadStream(row.id)))
	}

	brief(ref: string, options: { as?: string } = {}): Briefing {
		const stream = this.#requireStream(this.#requireStreamId(ref), options.as)
		const pinned = stream.pinned
			.map((seq) => this.entry(stream.id, seq))
			.filter((entry): entry is Entry => entry !== undefined)
		return {
			stream,
			states: this.states({ stream: stream.id, status: 'open' }),
			pinned,
			views: this.views(stream.id),
			children: this.children(stream.id).map(({ id, handle, type, title, state }) => ({
				id,
				handle,
				type,
				title,
				state,
			})),
		}
	}

	renameStream(ref: string, handle: string, author: string): Stream {
		const id = this.#write(() => {
			const id = this.#requireStreamId(ref)
			validateHandle(handle)
			const owner = this.#findStreamId(handle)
			if (owner && owner !== id) throw new CynapseError(`stream handle "${handle}" is already taken`)
			const from = this.#get<{ handle: string }>('SELECT handle FROM streams WHERE id = ?', id)?.handle
			if (from === handle) return id
			this.#run('UPDATE streams SET handle = ? WHERE id = ?', handle, id)
			this.#run('INSERT OR IGNORE INTO stream_handles (handle, stream) VALUES (?, ?)', handle, id)
			this.#appendIn(id, { author, type: 'cynapse.stream.renamed', data: { from, to: handle } })
			return id
		})
		return this.#requireStream(id)
	}

	addMember(ref: string, participant: string, role: string, author: string): Entry {
		return this.#writeEntry(() => {
			const id = this.#requireStreamId(ref)
			this.#ensureParticipant(participant)
			this.#run(
				`INSERT INTO members (stream, participant, role) VALUES (?, ?, ?)
				ON CONFLICT (stream, participant) DO UPDATE SET role = excluded.role`,
				id,
				participant,
				role,
			)
			return this.#appendIn(id, { author, type: 'cynapse.member.joined', data: { participant, role } })
		})
	}

	addContext(ref: string, contextRef: string, author: string): Entry {
		return this.#writeEntry(() => {
			const id = this.#requireStreamId(ref)
			this.#run('INSERT OR IGNORE INTO context (stream, ref) VALUES (?, ?)', id, contextRef)
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
			this.#run('INSERT OR IGNORE INTO pins (stream, entry) VALUES (?, ?)', target.stream, target.id)
			return this.#appendIn(target.stream, {
				author,
				type: 'cynapse.pinned',
				refs: [`${target.handle}#${target.seq}`],
				data: { target: target.id, seq: target.seq },
			})
		})
	}

	setLifecycle(ref: string, state: string, author: string): Entry {
		return this.#writeEntry(() => {
			const id = this.#requireStreamId(ref)
			const from = this.#get<{ state: string }>('SELECT state FROM streams WHERE id = ?', id)?.state
			this.#run('UPDATE streams SET state = ? WHERE id = ?', state, id)
			return this.#appendIn(id, {
				author,
				type: 'cynapse.state.changed',
				data: { key: 'lifecycle', kind: 'lifecycle', from, to: state },
			})
		})
	}

	defineView(ref: string, name: string, filter: ViewFilter, author: string): Entry {
		return this.#writeEntry(() => {
			const id = this.#requireStreamId(ref)
			this.#run(
				`INSERT INTO views (stream, name, filter) VALUES (?, ?, ?)
				ON CONFLICT (stream, name) DO UPDATE SET filter = excluded.filter`,
				id,
				name,
				JSON.stringify(filter),
			)
			return this.#appendIn(id, { author, type: 'cynapse.view.defined', data: { name, filter } })
		})
	}

	views(ref: string): View[] {
		const id = this.#requireStreamId(ref)
		return this.#all<{ stream: string; name: string; filter: string }>(
			'SELECT stream, name, filter FROM views WHERE stream = ? ORDER BY name',
			id,
		).map((row) => ({ streamId: row.stream, name: row.name, filter: JSON.parse(row.filter) as ViewFilter }))
	}

	// ── entries ─────────────────────────────────────────────────────────────────

	append(ref: string, input: AppendInput): Entry {
		return this.#writeEntry(() => this.#appendIn(this.#requireStreamId(ref), input))
	}

	entry(ref: string, seq?: number): Entry | undefined {
		const row =
			seq === undefined
				? this.#findEntryRow(ref)
				: this.#get<EntryRow>(`${ENTRY_SELECT} WHERE e.stream = ? AND e.seq = ?`, this.#findStreamId(ref) ?? '', seq)
		return row ? this.#toEntry(row) : undefined
	}

	entries(ref: string, query: EntryQuery = {}): Entry[] {
		const id = this.#requireStreamId(ref)
		const where = ['e.stream = ?']
		const params: SQLInputValue[] = [id]
		let filter: ViewFilter = query
		if (query.view) {
			const view = this.#get<{ filter: string }>(
				'SELECT filter FROM views WHERE stream = ? AND name = ?',
				id,
				query.view,
			)
			if (!view) throw new CynapseError(`no view named "${query.view}" on stream ${ref}`)
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
				"SELECT MAX(seq) AS seq FROM entries WHERE stream = ? AND type = 'cynapse.summary'",
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
		if (query.streams?.length) {
			const ids = query.streams.map((ref) => this.#requireStreamId(ref))
			where.push(`e.stream IN (${ids.map(() => '?').join(', ')})`)
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
			const id = this.#requireStreamId(ref)
			const last = this.#lastSeq(id)
			const target = Math.min(seq ?? last, last)
			this.#ensureParticipant(participant)
			// A cursor only moves forward; re-reading old entries must not mark newer ones unread.
			this.#run(
				`INSERT INTO cursors (stream, participant, seq) VALUES (?, ?, ?)
				ON CONFLICT (stream, participant) DO UPDATE SET seq = MAX(seq, excluded.seq)`,
				id,
				participant,
				target,
			)
			const role = this.#get<{ role: string }>(
				'SELECT role FROM members WHERE stream = ? AND participant = ?',
				id,
				participant,
			)?.role
			return { participant, role: role ?? 'reader', cursor: this.#cursor(id, participant) }
		})
	}

	unread(participant: string): { streamId: string; handle: string; count: number }[] {
		return this.#all<{ streamId: string; handle: string; count: number }>(
			`SELECT s.id AS streamId, s.handle AS handle, COUNT(e.id) AS count
			FROM members m
			JOIN streams s ON s.id = m.stream
			LEFT JOIN cursors c ON c.stream = m.stream AND c.participant = m.participant
			JOIN entries e ON e.stream = m.stream AND e.seq > COALESCE(c.seq, 0) AND e.author <> m.participant
			WHERE m.participant = ?
			GROUP BY s.id
			ORDER BY s.handle`,
			participant,
		)
	}

	// ── state records ───────────────────────────────────────────────────────────

	setState(ref: string, input: SetStateInput, author: string): StateRecord {
		return this.#write(() => {
			const id = this.#requireStreamId(ref)
			if (input.kind === 'lifecycle') throw new CynapseError('lifecycle is set with setLifecycle, not setState')
			const previous = this.#get<StateRow>('SELECT * FROM states WHERE stream = ? AND key = ?', id, input.key)
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
				`INSERT INTO states (stream, key, kind, status, subject, entry, value, seq, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT (stream, key) DO UPDATE SET kind = excluded.kind, status = excluded.status,
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
				this.#get<StateRow>('SELECT * FROM states WHERE stream = ? AND key = ?', id, input.key) as StateRow,
			)
		})
	}

	states(query: StateQuery = {}): StateRecord[] {
		const where: string[] = []
		const params: SQLInputValue[] = []
		if (query.stream) {
			where.push('stream = ?')
			params.push(this.#requireStreamId(query.stream))
		}
		for (const field of ['kind', 'status', 'subject'] as const) {
			const value = query[field]
			if (value) {
				where.push(`${field} = ?`)
				params.push(value)
			}
		}
		return this.#all<StateRow>(
			`SELECT * FROM states ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at, stream, key`,
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

	#appendIn(streamId: string, input: AppendInput): Entry {
		if (input.id) {
			if (!isUuid(input.id)) throw new CynapseError(`entry id "${input.id}" is not a UUID`)
			const existing = this.#findEntryRow(input.id)
			if (existing) {
				// Same id is the same write: a retry, not a new entry.
				if (existing.stream !== streamId) {
					throw new CynapseError(`entry ${input.id} already exists in stream ${existing.handle}`)
				}
				return this.#toEntry(existing)
			}
		}
		const id = input.id ?? uuidv7(this.#clock())
		let root: string | null = null
		let parent: string | null = null
		if (input.parent) {
			const parentRow = this.#requireEntryRow(input.parent)
			if (parentRow.stream !== streamId) {
				throw new CynapseError(`parent ${input.parent} is in another stream; replies stay in one stream`)
			}
			parent = parentRow.id
			root = parentRow.root ?? parentRow.id
		}
		this.#ensureParticipant(input.author)
		const seq = this.#lastSeq(streamId) + 1
		this.#run(
			`INSERT INTO entries (id, stream, seq, author, type, parent, root, refs, body, data, recorded_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			id,
			streamId,
			seq,
			input.author,
			input.type,
			parent,
			root,
			JSON.stringify(input.refs ?? []),
			input.body ?? '',
			input.data === undefined ? null : JSON.stringify(input.data),
			this.#now(),
		)
		for (const tag of new Set(input.tags ?? [])) {
			this.#run('INSERT INTO entry_tags (entry, tag) VALUES (?, ?)', id, tag)
		}
		return this.#toEntry(this.#findEntryRow(id) as EntryRow)
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
			return this.#appendIn(target.stream, {
				author,
				type: 'cynapse.label',
				refs: [`${target.handle}#${target.seq}`],
				data: { target: target.id, ...(add.length ? { add } : {}), ...(remove.length ? { remove } : {}) },
			})
		})
	}

	#lastSeq(streamId: string): number {
		return this.#get<{ seq: number | null }>('SELECT MAX(seq) AS seq FROM entries WHERE stream = ?', streamId)?.seq ?? 0
	}

	#cursor(streamId: string, participant: string): number {
		return (
			this.#get<{ seq: number }>('SELECT seq FROM cursors WHERE stream = ? AND participant = ?', streamId, participant)
				?.seq ?? 0
		)
	}

	#ensureParticipant(id: string): void {
		this.#run("INSERT OR IGNORE INTO participants (id, kind, name) VALUES (?, 'agent', ?)", id, id)
	}

	#findStreamId(ref: string): string | undefined {
		if (isUuid(ref)) {
			const row = this.#get<{ id: string }>('SELECT id FROM streams WHERE id = ?', ref.toLowerCase())
			if (row) return row.id
		}
		return this.#get<{ stream: string }>('SELECT stream FROM stream_handles WHERE handle = ?', ref)?.stream
	}

	#requireStreamId(ref: string): string {
		const id = this.#findStreamId(ref)
		if (!id) throw new CynapseError(`no stream found for "${ref}"`)
		return id
	}

	#requireStream(id: string, as?: string): Stream {
		return this.#loadStream(id, as)
	}

	#findEntryRow(ref: string): EntryRow | undefined {
		if (isUuid(ref)) return this.#get<EntryRow>(`${ENTRY_SELECT} WHERE e.id = ?`, ref.toLowerCase())
		const short = /^(.+)#(\d+)$/.exec(ref)
		if (!short) return undefined
		const streamId = this.#findStreamId(short[1] as string)
		if (!streamId) return undefined
		return this.#get<EntryRow>(`${ENTRY_SELECT} WHERE e.stream = ? AND e.seq = ?`, streamId, Number(short[2]))
	}

	#requireEntryRow(ref: string): EntryRow {
		const row = this.#findEntryRow(ref)
		if (!row) throw new CynapseError(`no entry found for "${ref}"`)
		return row
	}

	#loadStream(id: string, as?: string): Stream {
		const row = this.#get<StreamRow>('SELECT * FROM streams WHERE id = ?', id)
		if (!row) throw new CynapseError(`no stream found for "${id}"`)
		const aliases = this.#all<{ handle: string }>(
			'SELECT handle FROM stream_handles WHERE stream = ? AND handle <> ? ORDER BY handle',
			id,
			row.handle,
		).map((alias) => alias.handle)
		const members = this.#all<Member>(
			`SELECT m.participant, m.role, COALESCE(c.seq, 0) AS cursor
			FROM members m LEFT JOIN cursors c ON c.stream = m.stream AND c.participant = m.participant
			WHERE m.stream = ? ORDER BY m.rowid`,
			id,
		)
		const context = this.#all<{ ref: string }>('SELECT ref FROM context WHERE stream = ? ORDER BY rowid', id).map(
			(c) => c.ref,
		)
		const pinned = this.#all<{ seq: number }>(
			'SELECT e.seq FROM pins p JOIN entries e ON e.id = p.entry WHERE p.stream = ? ORDER BY e.seq',
			id,
		).map((p) => p.seq)
		const stats = this.#get<{ entries: number; lastSeq: number | null; lastAt: string | null }>(
			'SELECT COUNT(*) AS entries, MAX(seq) AS lastSeq, MAX(recorded_at) AS lastAt FROM entries WHERE stream = ?',
			id,
		)
		let parent: Stream['parent']
		if (row.parent_entry && row.parent_stream) {
			const anchorSeq = this.#get<{ seq: number }>('SELECT seq FROM entries WHERE id = ?', row.parent_entry)?.seq ?? 0
			parent = { streamId: row.parent_stream, entryId: row.parent_entry, seq: anchorSeq }
		}
		const lastSeq = stats?.lastSeq ?? 0
		let unread: number | undefined
		if (as) {
			unread =
				this.#get<{ count: number }>(
					'SELECT COUNT(*) AS count FROM entries WHERE stream = ? AND seq > ? AND author <> ?',
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
			traits: JSON.parse(row.traits) as StreamTraits,
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
			streamId: row.stream,
			stream: row.handle,
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
			streamId: row.stream,
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
	// UUID would shadow a stream id.
	if (!/^[a-z0-9][a-z0-9._/-]*$/i.test(handle) || isUuid(handle)) {
		throw new CynapseError(`"${handle}" is not a valid stream handle (letters, digits, . _ / -)`)
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
