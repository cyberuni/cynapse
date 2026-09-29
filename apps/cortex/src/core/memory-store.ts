// An in-memory `Store` that follows the cynapse contract. It backs Cortex's tests and
// the `CORTEX_FIXTURE` demo mode, so Cortex runs without a cynapse database.
import type {
	AppendInput,
	EntriesQuery,
	Entry,
	Participant,
	SearchQuery,
	StateInput,
	StateRecord,
	StatesQuery,
	Store,
	Stream,
	View,
} from './model.ts'

type StreamInput = {
	handle: string
	type: string
	title: string
	purpose?: string
	/** `handle#seq` of the anchor entry in the parent stream. */
	anchor?: string
	members?: { participant: string; role: string }[]
	context?: string[]
	state?: string
	conventions?: string[]
}

export type MemoryStore = Store & {
	createStream(input: StreamInput): Stream
	defineView(ref: string, view: Omit<View, 'streamId'>): void
	pin(ref: string, seq: number): void
	addParticipant(participant: Participant): void
	setLifecycle(ref: string, state: string, author: string): void
}

export function createMemoryStore(options: { now?: () => Date } = {}): MemoryStore {
	let clock = options.now ?? (() => new Date())
	let counter = 0
	const streams: Stream[] = []
	const entries = new Map<string, Entry[]>()
	const states: StateRecord[] = []
	const views: View[] = []
	const participants: Participant[] = []

	const nextId = () => `0199${(++counter).toString(16).padStart(28, '0')}`
	const now = () => {
		const d = clock()
		clock = () => new Date(d.getTime() + 60_000)
		return d.toISOString()
	}

	function getStream(ref: string) {
		return streams.find((s) => s.id === ref || s.handle === ref || s.aliases.includes(ref))
	}
	function mustStream(ref: string) {
		const stream = getStream(ref)
		if (!stream) throw new Error(`unknown stream: ${ref}`)
		return stream
	}
	function entry(ref: string): Entry | undefined {
		const hash = ref.lastIndexOf('#')
		if (hash > 0) {
			const stream = getStream(ref.slice(0, hash))
			const seq = Number(ref.slice(hash + 1))
			return stream && entries.get(stream.id)?.find((e) => e.seq === seq)
		}
		for (const list of entries.values()) {
			const found = list.find((e) => e.id === ref)
			if (found) return found
		}
		return undefined
	}
	function matches(e: Entry, q: { types?: string[]; tags?: string[]; authors?: string[]; excludeTypes?: string[] }) {
		if (q.types?.length && !q.types.includes(e.type)) return false
		if (q.excludeTypes?.includes(e.type)) return false
		if (q.tags?.length && !q.tags.some((t) => e.tags.includes(t))) return false
		if (q.authors?.length && !q.authors.includes(e.author)) return false
		return true
	}

	const store: MemoryStore = {
		createStream(input) {
			const anchor = input.anchor ? entry(input.anchor) : undefined
			if (input.anchor && !anchor) throw new Error(`unknown anchor: ${input.anchor}`)
			const createdAt = now()
			const stream: Stream = {
				id: nextId(),
				handle: input.handle,
				aliases: [],
				type: input.type,
				title: input.title,
				purpose: input.purpose,
				parent: anchor ? { streamId: anchor.streamId, entryId: anchor.id, seq: anchor.seq } : undefined,
				members: (input.members ?? []).map((m) => ({ ...m, cursor: 0 })),
				context: input.context ?? [],
				traits: { membership: 'open', wake: true },
				state: input.state ?? 'active',
				pinned: [],
				conventions: input.conventions ?? [],
				stats: { entries: 0, lastSeq: 0 },
				createdAt,
			}
			streams.push(stream)
			entries.set(stream.id, [])
			return stream
		},
		defineView(ref, view) {
			views.push({ ...view, streamId: mustStream(ref).id })
		},
		pin(ref, seq) {
			mustStream(ref).pinned.push(seq)
		},
		setLifecycle(ref, state, author) {
			const stream = mustStream(ref)
			store.append(ref, {
				author,
				type: 'cynapse.state.changed',
				body: `lifecycle → ${state}`,
				data: { lifecycle: state },
			})
			stream.state = state
		},
		addParticipant(participant) {
			participants.push(participant)
		},
		listStreams(query = {}) {
			return streams.filter(
				(s) =>
					(!query.type || s.type === query.type) &&
					(!query.state || s.state === query.state) &&
					(!query.parent || s.parent?.streamId === getStream(query.parent)?.id),
			)
		},
		getStream,
		children(ref) {
			const id = mustStream(ref).id
			return streams.filter((s) => s.parent?.streamId === id)
		},
		entries(ref, query: EntriesQuery = {}) {
			const stream = mustStream(ref)
			const view = query.view ? views.find((v) => v.streamId === stream.id && v.name === query.view) : undefined
			let list = (entries.get(stream.id) ?? []).filter(
				(e) => e.seq > (query.afterSeq ?? 0) && matches(e, query) && (!view || matches(e, view.filter)),
			)
			if (query.limit !== undefined) list = list.slice(0, query.limit)
			return list
		},
		entry,
		search(query: SearchQuery) {
			const ids = query.streams?.map((s) => mustStream(s).id)
			return streams
				.filter((s) => !ids || ids.includes(s.id))
				.flatMap((s) => (entries.get(s.id) ?? []).filter((e) => matches(e, query)))
		},
		states(query: StatesQuery = {}) {
			const streamId = query.stream ? mustStream(query.stream).id : undefined
			return states.filter(
				(r) =>
					(!streamId || r.streamId === streamId) &&
					(!query.kind || r.kind === query.kind) &&
					(!query.status || r.status === query.status) &&
					(!query.subject || r.subject === query.subject),
			)
		},
		unread(participant) {
			return streams.flatMap((s) => {
				const member = s.members.find((m) => m.participant === participant)
				if (!member) return []
				const count = (entries.get(s.id) ?? []).filter((e) => e.seq > member.cursor && e.author !== participant).length
				return count ? [{ streamId: s.id, handle: s.handle, count }] : []
			})
		},
		views(ref) {
			const id = mustStream(ref).id
			return views.filter((v) => v.streamId === id)
		},
		participants() {
			return participants
		},
		append(ref, input: AppendInput) {
			const stream = mustStream(ref)
			const list = entries.get(stream.id) ?? []
			const existing = input.id ? list.find((e) => e.id === input.id) : undefined
			if (existing) return existing
			const parent = input.parent ? entry(input.parent) : undefined
			const root = parent ? (parent.root ? entry(parent.root) : parent) : undefined
			const at = now()
			const created: Entry = {
				id: input.id ?? nextId(),
				streamId: stream.id,
				stream: stream.handle,
				seq: stream.stats.lastSeq + 1,
				author: input.author,
				type: input.type,
				tags: input.tags ?? [],
				parent: parent?.id,
				parentSeq: parent?.seq,
				root: root?.id,
				rootSeq: root?.seq,
				refs: input.refs ?? [],
				body: input.body ?? '',
				data: input.data,
				createdAt: at,
				recordedAt: at,
			}
			list.push(created)
			stream.stats = { entries: list.length, lastSeq: created.seq, lastAt: at }
			return created
		},
		markRead(ref, participant, seq) {
			const stream = mustStream(ref)
			const member = stream.members.find((m) => m.participant === participant)
			if (member) member.cursor = Math.max(member.cursor, seq ?? stream.stats.lastSeq)
		},
		setState(ref, input: StateInput, author) {
			const stream = mustStream(ref)
			const logged = store.append(ref, {
				author,
				type: 'cynapse.state.changed',
				body: `${input.kind} ${input.key} → ${input.status}`,
				data: { ...input },
			})
			const record: StateRecord = { ...input, streamId: stream.id, seq: logged.seq, updatedAt: logged.createdAt }
			const index = states.findIndex((r) => r.streamId === stream.id && r.key === input.key)
			if (index >= 0) states[index] = record
			else states.push(record)
			return record
		},
	}
	return store
}
