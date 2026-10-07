import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import { isDeepStrictEqual } from 'node:util'
import { channelIdOf, channelKey, type SubjectId } from '../channel-key.js'
import { CynapseError, EXIT_AMBIGUOUS_ADDRESS, EXIT_UNKNOWN_ADDRESS } from '../cli-error.js'
import { isUuid, timestampOf, uuidv5, uuidv7 } from '../ids.js'
import { connect } from './connect.js'
import { migrate } from './migrate.js'
import { MIGRATIONS } from './schema.js'
import type {
	AppendInput,
	Briefing,
	Changes,
	Channel,
	ChannelKind,
	ChannelTraits,
	ChannelTree,
	ConditionalAppend,
	CreateChannelInput,
	Entry,
	EntryMatch,
	EntryQuery,
	ListChannelsQuery,
	Member,
	NewParticipant,
	Participant,
	ParticipantKind,
	ParticipantQuery,
	ParticipantStatus,
	RegisterAddressInput,
	RegisteredParticipant,
	RegisterParticipantInput,
	ResolveAddressOptions,
	ResolvedAddress,
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
	kind: ChannelKind
	owner: string | null
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
	deleted_at: string | null
	deleted_by: string | null
}

interface ParticipantRow {
	id: string
	kind: ParticipantKind
	name: string
	status: ParticipantStatus
	key: string | null
	registered_by: string | null
}

const PARTICIPANT_SELECT = 'SELECT id, kind, name, status, key, registered_by FROM participants'

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
		e.root, r.seq AS root_seq, e.refs, e.tags AS write_tags, e.body, e.data, e.recorded_at,
		e.deleted_at, e.deleted_by
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
		this.#db = connect(options.path, { busyTimeoutMs: options.busyTimeoutMs })
		this.#clock = options.clock ?? Date.now
		try {
			migrate(this.#db, MIGRATIONS)
		} catch (error) {
			this.#db.close()
			throw error
		}
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

	addParticipant(participant: NewParticipant): Participant {
		this.#write(() =>
			this.#run(
				`INSERT INTO participants (id, kind, name) VALUES (?, ?, ?)
				ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, name = excluded.name`,
				participant.id,
				participant.kind,
				participant.name,
			),
		)
		return this.#requireParticipant(participant.id)
	}

	participants(query: ParticipantQuery = {}): Participant[] {
		const where: string[] = []
		const params: SQLInputValue[] = []
		if (query.status) {
			where.push('status = ?')
			params.push(query.status)
		}
		if (query.registeredBy) {
			where.push('registered_by = ?')
			params.push(query.registeredBy)
		}
		return this.#all<ParticipantRow>(
			`${PARTICIPANT_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id`,
			...params,
		).map(toParticipant)
	}

	registerParticipant(input: RegisterParticipantInput): RegisteredParticipant {
		validateParticipantKey(input.key)
		const name = validateParticipantName(input.name)
		const id = uuidv5(input.key)
		const registeredBy = input.registeredBy ?? id
		const channelId = this.#write(() => {
			this.#checkRegistrant(registeredBy, id, input)
			const existing = this.#findParticipant(id)
			if (existing && existing.kind !== input.kind) {
				throw new CynapseError(
					`participant id ${id} (derived from the key ${input.key}) already exists and differs in kind`,
					{ code: 'id_conflict' },
				)
			}
			const subject = addressOf(id)
			const address = this.#subjectChannelId(subject)
			// Registering a live key again is a no-op: the runtime may re-register on every start.
			if (existing?.status === 'live' && existing.key === input.key && address) return address
			if (existing) {
				this.#run(
					"UPDATE participants SET status = 'live', key = ?, registered_by = ? WHERE id = ?",
					input.key,
					registeredBy,
					id,
				)
			} else {
				this.#run(
					"INSERT INTO participants (id, kind, name, status, key, registered_by) VALUES (?, ?, ?, 'live', ?, ?)",
					id,
					input.kind,
					name,
					input.key,
					registeredBy,
				)
			}
			// A revived participant keeps its name and address channel; renaming is its own act.
			const current = this.#requireParticipant(id)
			const channelId =
				address ??
				this.createChannel({
					handle: this.#addressHandle(current.name, id),
					type: 'cynapse.participant',
					title: current.name,
					author: registeredBy,
					subject,
					kind: 'address',
					owner: id,
				}).id
			this.#appendIn(channelId, {
				author: registeredBy,
				type: 'cynapse.participant.registered',
				data: { participant: id, key: input.key, kind: current.kind, name: current.name, registeredBy },
			})
			return channelId
		})
		return { participant: this.#requireParticipant(id), channel: this.#requireChannel(channelId) }
	}

	retireParticipant(id: string, author: string): Participant {
		this.#write(() => {
			const participant = this.#requireParticipant(id)
			if (participant.status === 'retired') return
			const channelId = this.#requireAddress(participant, 'retired')
			this.#run("UPDATE participants SET status = 'retired' WHERE id = ?", participant.id)
			this.#appendIn(channelId, { author, type: 'cynapse.participant.retired', data: { participant: participant.id } })
		})
		return this.#requireParticipant(id)
	}

	renameParticipant(id: string, name: string, author: string): Participant {
		const to = validateParticipantName(name)
		this.#write(() => {
			const participant = this.#requireParticipant(id)
			if (participant.name === to) return
			const channelId = this.#requireAddress(participant, 'renamed')
			this.#run('UPDATE participants SET name = ? WHERE id = ?', to, participant.id)
			this.renameChannel(channelId, this.#addressHandle(to, participant.id, channelId), author)
			this.#appendIn(channelId, {
				author,
				type: 'cynapse.participant.renamed',
				data: { participant: participant.id, from: participant.name, to },
			})
		})
		return this.#requireParticipant(id)
	}

	/**
	 * An exact match, never fuzzy: a fuzzy match with one candidate today silently routes
	 * elsewhere tomorrow (ADR-0013, need 1). The id matches too, so every candidate an
	 * ambiguity lists can still be addressed.
	 */
	resolveAddress(name: string, options: ResolveAddressOptions = {}): ResolvedAddress {
		const where = [
			"p.status = 'live'",
			`(p.id = ?1 OR p.name = ?1 OR EXISTS (
				SELECT 1 FROM channel_subjects cs JOIN channel_handles h ON h.channel = cs.channel
				WHERE cs.store = 'cynapse' AND cs.native_id = p.id AND h.handle = ?1))`,
		]
		const params: SQLInputValue[] = [name]
		if (options.kinds?.length) {
			where.push(`p.kind IN (${options.kinds.map((_, i) => `?${i + 2}`).join(', ')})`)
			params.push(...options.kinds)
		}
		const matches = this.#all<ParticipantRow>(
			`SELECT p.id, p.kind, p.name, p.status, p.key, p.registered_by FROM participants p
			WHERE ${where.join(' AND ')} ORDER BY p.id`,
			...params,
		).map(toParticipant)
		const among = options.kinds?.length ? ` of kind ${options.kinds.join(' or ')}` : ''
		const [participant] = matches
		if (!participant) {
			throw new CynapseError(`no live participant${among} is named "${name}"`, {
				code: 'unknown_address',
				exitCode: EXIT_UNKNOWN_ADDRESS,
			})
		}
		if (matches.length > 1) {
			const candidates = matches.map(({ id, kind, name, registeredBy }) => ({
				id,
				kind,
				name,
				...(registeredBy ? { registeredBy } : {}),
			}))
			const lines = candidates.map(
				(c) => `  ${c.id}  ${c.kind}  ${c.name}${c.registeredBy ? `  registered by ${c.registeredBy}` : ''}`,
			)
			throw new CynapseError(
				[`"${name}" names ${matches.length} live participants${among}; address one by its id:`, ...lines].join('\n'),
				{ code: 'ambiguous_address', exitCode: EXIT_AMBIGUOUS_ADDRESS, details: { candidates } },
			)
		}
		const channelId = this.#subjectChannelId(addressOf(participant.id))
		return { participant, ...(channelId ? { channel: this.#requireChannel(channelId) } : {}) }
	}

	/**
	 * A unit registers itself, as a service, or is registered by a service that already
	 * exists. cynapse records the registrant and never calls it back (ADR-0013).
	 */
	#checkRegistrant(registeredBy: string, id: string, input: RegisterParticipantInput): void {
		if (registeredBy === id) {
			if (input.kind !== 'service') {
				throw new CynapseError(
					`only a service registers itself; ${input.key} is ${input.kind === 'agent' ? 'an' : 'a'} ${input.kind}, so pass the unit that registers it`,
				)
			}
			return
		}
		const unit = this.#findParticipant(registeredBy)
		if (!unit) throw new CynapseError(`no participant found for registrant "${registeredBy}"`, { code: 'not_found' })
		if (unit.kind !== 'service') {
			throw new CynapseError(
				`registrant ${registeredBy} is ${unit.kind === 'agent' ? 'an' : 'a'} ${unit.kind}; a unit that registers participants is a service`,
			)
		}
	}

	/** The address channel a lifecycle change is logged in; a participant from before the registry has none. */
	#requireAddress(participant: Participant, act: string): string {
		const channelId = this.#subjectChannelId(addressOf(participant.id))
		if (!channelId) {
			throw new CynapseError(
				`participant ${participant.id} was never registered, so it has no address channel; register it before it can be ${act}`,
			)
		}
		return channelId
	}

	/**
	 * A handle for a participant's address channel: its name made into a valid handle, with
	 * the start of its id appended when another channel already holds that handle. Names are
	 * not unique, and handles are.
	 */
	#addressHandle(name: string, id: string, channelId?: string): string {
		const base = handleOf(name) || 'participant'
		const holder = this.#findChannelId(base)
		if (!isUuid(base) && (!holder || holder === channelId)) return base
		return `${base}-${id.slice(0, 8)}`
	}

	#findParticipant(id: string): Participant | undefined {
		const row = this.#get<ParticipantRow>(`${PARTICIPANT_SELECT} WHERE id = ?`, id)
		return row ? toParticipant(row) : undefined
	}

	#requireParticipant(id: string): Participant {
		const participant = this.#findParticipant(id)
		if (!participant) throw new CynapseError(`no participant found for "${id}"`, { code: 'not_found' })
		return participant
	}

	// ── channels ─────────────────────────────────────────────────────────────────

	createChannel(input: CreateChannelInput): Channel {
		const kind = validateKind(input)
		const id = this.#write(() => {
			const anchor = input.anchor ? this.#requireEntryRow(input.anchor) : undefined
			const id = input.subject
				? (this.#subjectChannelId(input.subject) ?? channelIdOf(input.subject))
				: anchor
					? uuidv5(anchor.id)
					: input.key
						? uuidv5(input.key)
						: uuidv7(this.#clock())
			// A derived id makes creation idempotent: two agents opening the same channel at
			// once end up in one channel, not two.
			if (this.#get('SELECT 1 AS found FROM channels WHERE id = ?', id)) {
				const field = this.#createConflict(id, input, kind)
				if (field) {
					const source = input.subject ? 'subject' : anchor ? 'anchor' : 'key'
					throw new CynapseError(
						`channel id ${id} (derived from the ${source}) already exists and differs in ${field}`,
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
					conventions, created_at, kind, owner)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
				kind,
				input.owner ?? null,
			)
			this.#run('INSERT INTO channel_handles (handle, channel) VALUES (?, ?)', input.handle, id)
			if (input.subject) this.#insertSubject(input.subject, id)
			if (input.owner) this.#ensureParticipant(input.owner)
			this.#appendIn(id, {
				author: input.author,
				type: 'cynapse.channel.created',
				data: {
					handle: input.handle,
					type: input.type,
					title: input.title,
					kind,
					...(input.owner ? { owner: input.owner } : {}),
					...(input.subject ? { subject: subjectOf(input.subject) } : {}),
					...(input.purpose ? { purpose: input.purpose } : {}),
					...(anchor ? { anchor: anchor.id } : {}),
				},
			})
			return id
		})
		return this.#requireChannel(id)
	}

	registerAddress(input: RegisterAddressInput): Channel {
		return this.createChannel({
			...input,
			subject: { store: 'cynapse', nativeId: uuidv7(this.#clock()) },
			kind: 'address',
		})
	}

	/**
	 * The first field in which a repeated create of a derived-id channel differs from the
	 * stored channel. A handle still matches after a rename, since the old one is an alias.
	 * A subject's channel is shared by every consumer that works on the subject (ADR-0012),
	 * so only a contradiction about the subject itself, its kind or owner, conflicts.
	 */
	#createConflict(id: string, input: CreateChannelInput, kind: ChannelKind): string | undefined {
		const stored = this.#get<ChannelRow>('SELECT * FROM channels WHERE id = ?', id) as ChannelRow
		if (stored.kind !== kind) return 'kind'
		if ((stored.owner ?? undefined) !== input.owner) return 'owner'
		if (input.subject) return undefined
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

	getChannelBySubject(subject: SubjectId): Channel | undefined {
		const id = this.#subjectChannelId(subject)
		return id ? this.#loadChannel(id) : undefined
	}

	addSubject(ref: string, subject: SubjectId, author: string): Channel {
		const id = this.#write(() => {
			const id = this.#requireChannelId(ref)
			const holder = this.#subjectChannelId(subject)
			if (holder === id) return id
			if (holder) throw new CynapseError(`subject ${channelKey(subject)} already keys channel ${holder}`)
			this.#insertSubject(subject, id)
			this.#appendIn(id, { author, type: 'cynapse.channel.subject-added', data: { subject: subjectOf(subject) } })
			return id
		})
		return this.#requireChannel(id)
	}

	setOwner(ref: string, owner: string, author: string): Entry {
		return this.#writeEntry(() => {
			const id = this.#requireChannelId(ref)
			const row = this.#get<{ kind: ChannelKind; owner: string | null }>(
				'SELECT kind, owner FROM channels WHERE id = ?',
				id,
			) as { kind: ChannelKind; owner: string | null }
			if (row.kind !== 'address') throw new CynapseError(`channel ${ref} is a work channel, which has no owner`)
			this.#ensureParticipant(owner)
			this.#run('UPDATE channels SET owner = ? WHERE id = ?', owner, id)
			return this.#appendIn(id, {
				author,
				type: 'cynapse.channel.owner-changed',
				data: { ...(row.owner ? { from: row.owner } : {}), to: owner },
			})
		})
	}

	listChannels(query: ListChannelsQuery = {}): Channel[] {
		const where: string[] = []
		const params: SQLInputValue[] = []
		if (query.kind) {
			where.push('kind = ?')
			params.push(query.kind)
		}
		if (query.type) {
			where.push('type = ?')
			params.push(query.type)
		}
		if (query.state) {
			where.push('state = ?')
			params.push(query.state)
		} else if (!query.includeDeleted) {
			where.push('state <> ?')
			params.push(DELETED_STATE)
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
			'SELECT id FROM channels WHERE parent_channel IS NULL AND state <> ? ORDER BY created_at, id',
			DELETED_STATE,
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
			const target = this.#requireLiveEntryRow(entryRef, 'pinned')
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
		if (state === DELETED_STATE) {
			throw new CynapseError('the deleted lifecycle is set by deleteChannel, which also erases the entries', {
				help: 'run `cynapse channel delete <channel>` instead',
			})
		}
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

	deleteChannel(ref: string, author: string): Entry {
		return this.#writeEntry(() => {
			const id = this.#requireChannelId(ref)
			const from = (this.#get<{ state: string }>('SELECT state FROM channels WHERE id = ?', id) as { state: string })
				.state
			const targets = this.#all<{ id: string }>(
				"SELECT id FROM entries WHERE channel = ? AND deleted_at IS NULL AND type NOT LIKE 'cynapse.%' ORDER BY seq",
				id,
			)
			if (!targets.length && from === DELETED_STATE) {
				const last = this.#get<{ id: string }>(
					"SELECT id FROM entries WHERE channel = ? AND type = 'cynapse.channel.deleted' ORDER BY seq DESC LIMIT 1",
					id,
				) as { id: string }
				return this.#toEntry(this.#findEntryRow(last.id) as EntryRow)
			}
			for (const target of targets) this.#tombstone(target.id, author)
			this.#run('UPDATE channels SET state = ? WHERE id = ?', DELETED_STATE, id)
			return this.#appendIn(id, {
				author,
				type: 'cynapse.channel.deleted',
				data: { count: targets.length, ...(from === DELETED_STATE ? {} : { from }) },
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

	appendUnless(ref: string, input: AppendInput, unless: EntryMatch): ConditionalAppend {
		const result = this.#write((): { appended: boolean; id: string } => {
			const channelId = this.#requireChannelId(ref)
			// A deleted entry no longer says anything, so it cannot be the one already written.
			const where = ['e.channel = ?', 'e.deleted_at IS NULL']
			const params: SQLInputValue[] = [channelId]
			if (unless.parent) {
				where.push('e.parent = ?')
				params.push(this.#requireEntryRow(unless.parent).id)
			}
			applyFilter(unless, where, params)
			const match = this.#all<{ id: string }>(
				`SELECT e.id FROM entries e WHERE ${where.join(' AND ')} ORDER BY e.seq LIMIT 1`,
				...params,
			)[0]
			// A retry of the write that already landed is that write, not a conflict with it.
			if (match && match.id !== input.id) return { appended: false, id: match.id }
			return { appended: true, id: this.#appendIn(channelId, input).id }
		})
		const entry = this.entry(result.id) as Entry
		return result.appended ? { appended: true, entry } : { appended: false, existing: entry }
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
		const where = query.includeDeleted ? ['e.channel = ?'] : ['e.channel = ?', 'e.deleted_at IS NULL']
		const params: SQLInputValue[] = [id]
		let filter: ViewFilter = query
		if (query.view) {
			const view = this.#get<{ filter: string }>(
				'SELECT filter FROM views WHERE channel = ? AND name = ?',
				id,
				query.view,
			)
			if (!view) throw new CynapseError(`no view named "${query.view}" on channel ${ref}`, { code: 'not_found' })
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
		const where = ['e.deleted_at IS NULL']
		const params: SQLInputValue[] = []
		applyFilter(query, where, params)
		if (query.channels?.length) {
			const ids = query.channels.map((ref) => this.#requireChannelId(ref))
			where.push(`e.channel IN (${ids.map(() => '?').join(', ')})`)
			params.push(...ids)
		}
		const limit = query.limit ? `LIMIT ${Math.max(0, Math.trunc(query.limit))}` : ''
		return this.#all<EntryRow>(`${ENTRY_SELECT} WHERE ${where.join(' AND ')} ORDER BY e.id ${limit}`, ...params).map(
			(row) => this.#toEntry(row, query.metaOnly),
		)
	}

	deleteEntry(entryRef: string, author: string): Entry {
		return this.#writeEntry(() => {
			// No permission check: no caller can be verified, so the log naming who deleted is the record.
			const target = this.#requireEntryRow(entryRef)
			if (target.deleted_at) return this.#deletionOf(target)
			if (target.type.startsWith('cynapse.')) {
				throw new CynapseError(
					`${target.handle}#${target.seq} is a ${target.type} entry; cynapse.* entries record the channel itself and cannot be deleted`,
				)
			}
			this.#tombstone(target.id, author)
			return this.#appendIn(target.channel, {
				author,
				type: 'cynapse.entry.deleted',
				refs: [`${target.handle}#${target.seq}`],
				data: { target: target.id, seq: target.seq },
			})
		})
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

	/**
	 * Unread entries in the channels the participant is a member of, plus replies in the
	 * threads they follow elsewhere. A participant follows every thread they wrote in; in a
	 * channel they are not a member of, a reply counts when it comes after both their cursor
	 * there and their own last entry in that thread. Following is derived, never stored.
	 */
	unread(participant: string): { channelId: string; handle: string; count: number }[] {
		return this.#all<{ channelId: string; handle: string; count: number }>(
			`SELECT s.id AS channelId, s.handle AS handle, COUNT(e.id) AS count
			FROM members m
			JOIN channels s ON s.id = m.channel
			LEFT JOIN cursors c ON c.channel = m.channel AND c.participant = m.participant
			JOIN entries e ON e.channel = m.channel AND e.seq > COALESCE(c.seq, 0) AND e.author <> m.participant
				AND e.deleted_at IS NULL
			WHERE m.participant = ?1
			GROUP BY s.id
			UNION ALL
			SELECT s.id AS channelId, s.handle AS handle, COUNT(e.id) AS count
			FROM (
				SELECT mine.channel, COALESCE(mine.root, mine.id) AS thread, MAX(mine.seq) AS last
				FROM entries mine
				WHERE mine.author = ?1
					AND NOT EXISTS (SELECT 1 FROM members m WHERE m.channel = mine.channel AND m.participant = ?1)
				GROUP BY mine.channel, thread
			) f
			JOIN channels s ON s.id = f.channel
			LEFT JOIN cursors c ON c.channel = f.channel AND c.participant = ?1
			JOIN entries e ON e.channel = f.channel AND (e.id = f.thread OR e.root = f.thread)
				AND e.seq > MAX(f.last, COALESCE(c.seq, 0)) AND e.author <> ?1 AND e.deleted_at IS NULL
			GROUP BY s.id
			ORDER BY handle`,
			participant,
		)
	}

	/**
	 * A range read on `channels.change`, which every append sets from the store clock in
	 * its own write transaction, so a poll never scans entries.
	 */
	changes(since?: string): Changes {
		const clock = this.#get<{ store: string; change: number }>('SELECT store, change FROM store_clock') as {
			store: string
			change: number
		}
		const after = since === undefined ? -1 : readToken(since, clock.store)
		const channels = this.#all<{ channelId: string; handle: string; lastSeq: number }>(
			`SELECT s.id AS channelId, s.handle AS handle,
				COALESCE((SELECT MAX(e.seq) FROM entries e WHERE e.channel = s.id), 0) AS lastSeq
			FROM channels s
			WHERE s.change > ? AND s.change <= ?
			ORDER BY s.handle`,
			after,
			clock.change,
		)
		return { token: writeToken(clock.store, clock.change), channels }
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
		this.#guardReservedTags(channelId, input.tags ?? [], input.author)
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
			const parentRow = this.#requireLiveEntryRow(input.parent, 'replied to')
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
		// The store clock moves on every append, metadata entries included, in this same
		// write transaction, so two writers can never take the same value.
		this.#run('UPDATE store_clock SET change = change + 1')
		this.#run('UPDATE channels SET change = (SELECT change FROM store_clock) WHERE id = ?', channelId)
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
	/**
	 * Handled is defined on address channels only, and only their owner may set or clear
	 * it, so an observer or sender can never take a message out of the owner's unhandled
	 * set (ADR-0013, needs 5 and 6). Adding it at append time counts as adding it.
	 */
	#guardReservedTags(channelId: string, tags: string[], author: string): void {
		if (!tags.includes(HANDLED_TAG)) return
		const row = this.#get<{ kind: ChannelKind; owner: string | null }>(
			'SELECT kind, owner FROM channels WHERE id = ?',
			channelId,
		) as { kind: ChannelKind; owner: string | null }
		if (row.kind !== 'address') {
			throw new CynapseError(`${HANDLED_TAG} is defined on address channels only; this is a work channel`, {
				code: 'not_address',
			})
		}
		if (row.owner !== author) {
			throw new CynapseError(`only the channel's owner, ${row.owner}, may add or remove ${HANDLED_TAG}`, {
				code: 'not_owner',
			})
		}
	}

	#label(entryRef: string, add: string[], remove: string[], author: string): Entry {
		return this.#writeEntry(() => {
			const target = this.#requireLiveEntryRow(entryRef, 'tagged')
			this.#guardReservedTags(target.channel, [...add, ...remove], author)
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

	/** The channel a subject keys, validating the subject's key format on the way. */
	#subjectChannelId(subject: SubjectId): string | undefined {
		channelKey(subject)
		return this.#get<{ channel: string }>(
			'SELECT channel FROM channel_subjects WHERE store = ? AND native_id = ?',
			subject.store,
			subject.nativeId,
		)?.channel
	}

	#insertSubject(subject: SubjectId, channelId: string): void {
		this.#run(
			'INSERT INTO channel_subjects (store, native_id, channel) VALUES (?, ?, ?)',
			subject.store,
			subject.nativeId,
			channelId,
		)
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
		if (!id) throw new CynapseError(`no channel found for "${ref}"`, { code: 'not_found' })
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
		if (!row) throw new CynapseError(`no entry found for "${ref}"`, { code: 'not_found' })
		return row
	}

	#requireLiveEntryRow(ref: string, act: string): EntryRow {
		const row = this.#requireEntryRow(ref)
		if (row.deleted_at) throw new CynapseError(`${row.handle}#${row.seq} was deleted, so it cannot be ${act}`)
		return row
	}

	/**
	 * Erases an entry's content and keeps its row, so `seq` is never handed out again and
	 * replies and anchors still resolve (ADR-0014). The caller logs the delete.
	 */
	#tombstone(id: string, author: string): void {
		this.#run(
			`UPDATE entries SET body = '', data = NULL, refs = '[]', tags = '[]', deleted_at = ?, deleted_by = ?
			WHERE id = ?`,
			this.#now(),
			author,
			id,
		)
		this.#run('DELETE FROM entry_tags WHERE entry = ?', id)
		this.#run('DELETE FROM pins WHERE entry = ?', id)
	}

	/**
	 * The entry that logged a tombstone's delete: its own `cynapse.entry.deleted`, or the
	 * first channel delete after it, whichever came first.
	 */
	#deletionOf(target: EntryRow): Entry {
		const log = this.#get<{ id: string }>(
			`SELECT id FROM entries WHERE channel = ?1 AND seq > ?2 AND (
				(type = 'cynapse.entry.deleted' AND json_extract(data, '$.target') = ?3)
				OR type = 'cynapse.channel.deleted')
			ORDER BY seq LIMIT 1`,
			target.channel,
			target.seq,
			target.id,
		) as { id: string }
		return this.#toEntry(this.#findEntryRow(log.id) as EntryRow)
	}

	#loadChannel(id: string, as?: string): Channel {
		const row = this.#get<ChannelRow>('SELECT * FROM channels WHERE id = ?', id)
		if (!row) throw new CynapseError(`no channel found for "${id}"`, { code: 'not_found' })
		const aliases = this.#all<{ handle: string }>(
			'SELECT handle FROM channel_handles WHERE channel = ? AND handle <> ? ORDER BY handle',
			id,
			row.handle,
		).map((alias) => alias.handle)
		const subjects = this.#all<{ store: string; nativeId: string }>(
			'SELECT store, native_id AS nativeId FROM channel_subjects WHERE channel = ? ORDER BY rowid',
			id,
		).map(subjectOf)
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
		// A tombstone does not count as an entry, but its seq was handed out, so it counts in lastSeq.
		const stats = this.#get<{ entries: number; lastSeq: number | null; lastAt: string | null }>(
			`SELECT COUNT(*) - COUNT(deleted_at) AS entries, MAX(seq) AS lastSeq, MAX(recorded_at) AS lastAt
			FROM entries WHERE channel = ?`,
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
					'SELECT COUNT(*) AS count FROM entries WHERE channel = ? AND seq > ? AND author <> ? AND deleted_at IS NULL',
					id,
					this.#cursor(id, as),
					as,
				)?.count ?? 0
		}
		return {
			id: row.id,
			handle: row.handle,
			kind: row.kind,
			...(row.owner ? { owner: row.owner } : {}),
			subjects,
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
			...(row.deleted_at ? { deleted: { at: row.deleted_at, by: row.deleted_by ?? '' } } : {}),
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

const TOKEN_PREFIX = 'cyn1.'

/**
 * A change token: the store's id and its clock, encoded so it reads as one opaque string
 * rather than a number a caller might compare or treat as an entry order.
 */
function writeToken(store: string, change: number): string {
	return TOKEN_PREFIX + Buffer.from(`${store}:${change}`).toString('base64url')
}

/** The clock value in a token this store issued. */
function readToken(token: string, store: string): number {
	const invalid = () => new CynapseError(`"${token}" is not a change token`, { code: 'invalid_token' })
	if (!token.startsWith(TOKEN_PREFIX)) throw invalid()
	const payload = token.slice(TOKEN_PREFIX.length)
	if (!/^[A-Za-z0-9_-]+$/.test(payload)) throw invalid()
	const match = /^([0-9a-f-]{36}):(\d+)$/.exec(Buffer.from(payload, 'base64url').toString())
	if (!match) throw invalid()
	if (match[1] !== store) {
		throw new CynapseError('the change token was issued by another store; call changes without --since to start over', {
			code: 'foreign_token',
		})
	}
	return Number(match[2])
}

function validateHandle(handle: string): void {
	// `#` separates a handle from a seq in a short reference, and a handle shaped like a
	// UUID would shadow a channel id. `:` lets a readable reference (`gh:cyberuni/cynapse`)
	// be the handle of its subject's channel.
	if (!/^[a-z0-9][a-z0-9._/:-]*$/i.test(handle) || isUuid(handle)) {
		throw new CynapseError(`"${handle}" is not a valid channel handle (letters, digits, . _ / : -)`)
	}
}

/**
 * The channel's kind, after checking that the input is consistent with it: an address
 * channel has a subject and an owner and is not anchored, and a work channel has no owner.
 */
function validateKind(input: CreateChannelInput): ChannelKind {
	if (input.key?.startsWith('subject:')) {
		throw new CynapseError(`key "${input.key}" uses the reserved subject: form; pass the subject instead`)
	}
	if (input.subject && (input.anchor || input.key)) {
		throw new CynapseError('a channel keyed by a subject takes no anchor or key')
	}
	const kind = input.kind ?? 'work'
	if (kind === 'address') {
		if (input.anchor) throw new CynapseError('an address channel cannot branch from an anchor')
		if (!input.subject) throw new CynapseError('an address channel needs a subject; use registerAddress to mint one')
		if (!input.owner) throw new CynapseError('an address channel needs an owner')
	} else if (input.owner) {
		throw new CynapseError('a work channel has members, not an owner')
	}
	return kind
}

/**
 * A name made into a valid handle: runs of other characters become `-`, then the start is
 * trimmed to a letter or digit and trailing dashes are dropped. The trims scan indexes rather
 * than use a backtracking regex, because the name is caller-supplied and `/-+$/` is quadratic
 * on long runs of `-` that do not end the string.
 */
function handleOf(name: string): string {
	const replaced = name.replace(/[^a-z0-9._/:-]+/gi, '-')
	let start = 0
	while (start < replaced.length && !isAlphanumeric(replaced.charCodeAt(start))) start++
	let end = replaced.length
	while (end > start && replaced.charCodeAt(end - 1) === 0x2d) end--
	return replaced.slice(start, end)
}

function isAlphanumeric(code: number): boolean {
	return (code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)
}

/** The subject a participant's address channel is keyed by (ADR-0012). */
function addressOf(participantId: string): SubjectId {
	return { store: 'cynapse', nativeId: participantId }
}

function toParticipant(row: ParticipantRow): Participant {
	return {
		id: row.id,
		kind: row.kind,
		name: row.name,
		status: row.status,
		...(row.key ? { key: row.key } : {}),
		...(row.registered_by ? { registeredBy: row.registered_by } : {}),
	}
}

/** A registration key is namespaced by the unit that registers it: `<unit>:<rest>`. */
function validateParticipantKey(key: string): void {
	if (!/^[^\s:]+:\S+$/.test(key)) {
		throw new CynapseError(
			`"${key}" is not a namespaced registration key; prefix it with the registering unit, such as cyberlegion:role/reviewer`,
		)
	}
}

function validateParticipantName(name: string): string {
	const trimmed = name.trim()
	if (!trimmed) throw new CynapseError('a participant needs a name')
	return trimmed
}

/** A subject as a plain object, so one passed with extra fields is stored and compared as itself. */
function subjectOf(subject: SubjectId): SubjectId {
	return { store: subject.store, nativeId: subject.nativeId }
}

function mergeFilters(view: ViewFilter, extra: ViewFilter): ViewFilter {
	const both = <T>(a?: T[], b?: T[]) => (a && b ? a.filter((x) => b.includes(x)) : (a ?? b))
	return {
		types: both(view.types, extra.types),
		excludeTypes: [...(view.excludeTypes ?? []), ...(extra.excludeTypes ?? [])],
		tags: both(view.tags, extra.tags),
		authors: both(view.authors, extra.authors),
		excludeTags: [...(view.excludeTags ?? []), ...(extra.excludeTags ?? [])],
		excludeAuthors: [...(view.excludeAuthors ?? []), ...(extra.excludeAuthors ?? [])],
	}
}

function applyFilter(filter: ViewFilter, where: string[], params: SQLInputValue[]): void {
	const typeClause = (type: string) => {
		if (type.endsWith('.*')) {
			// Not LIKE: it ignores case and treats `_` and `%` as wildcards.
			const prefix = type.slice(0, -1)
			params.push(prefix, prefix)
			return 'substr(e.type, 1, length(?)) = ?'
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
	if (filter.excludeTags?.length) {
		where.push(
			`NOT EXISTS (SELECT 1 FROM entry_tags t WHERE t.entry = e.id AND t.tag IN (${filter.excludeTags.map(() => '?').join(', ')}))`,
		)
		params.push(...filter.excludeTags)
	}
	if (filter.excludeAuthors?.length) {
		where.push(`e.author NOT IN (${filter.excludeAuthors.map(() => '?').join(', ')})`)
		params.push(...filter.excludeAuthors)
	}
}

/** The lifecycle state `deleteChannel` sets; listings hide it unless asked. */
const DELETED_STATE = 'deleted'

/** The reserved tag that marks an entry on an address channel as handled by its owner. */
export const HANDLED_TAG = 'cynapse.handled'

/** Tags as a set, in a stable order, so the same tags given in another order compare equal. */
function normalizeTags(tags: string[] = []): string[] {
	return [...new Set(tags)].sort()
}
