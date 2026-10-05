// An in-memory `Store` that follows the cynapse contract. It backs the unit tests of
// the GUI's derivations, where a small hand-built world keeps each expectation readable;
// `src/server/store.test.ts` covers the real library on the real seed.
import type {
	AppendInput,
	Channel,
	Entry,
	EntryQuery,
	Participant,
	SearchQuery,
	SetStateInput,
	StateQuery,
	StateRecord,
	Store,
	View,
} from './model.ts'

type ChannelInput = {
	handle: string
	type: string
	title: string
	purpose?: string
	/** `handle#seq` of the anchor entry in the parent channel. */
	anchor?: string
	members?: { participant: string; role: string }[]
	context?: string[]
	state?: string
	conventions?: string[]
}

export type MemoryStore = Store & {
	createChannel(input: ChannelInput): Channel
	defineView(ref: string, view: Omit<View, 'channelId'>): void
	pin(ref: string, seq: number): void
	addParticipant(participant: Participant): void
	setLifecycle(ref: string, state: string, author: string): void
}

export function createMemoryStore(options: { now?: () => Date } = {}): MemoryStore {
	let clock = options.now ?? (() => new Date())
	let counter = 0
	const channels: Channel[] = []
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

	function getChannel(ref: string) {
		return channels.find((s) => s.id === ref || s.handle === ref || s.aliases.includes(ref))
	}
	function mustChannel(ref: string) {
		const channel = getChannel(ref)
		if (!channel) throw new Error(`unknown channel: ${ref}`)
		return channel
	}
	function entry(ref: string): Entry | undefined {
		const hash = ref.lastIndexOf('#')
		if (hash > 0) {
			const channel = getChannel(ref.slice(0, hash))
			const seq = Number(ref.slice(hash + 1))
			return channel && entries.get(channel.id)?.find((e) => e.seq === seq)
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
		createChannel(input) {
			const anchor = input.anchor ? entry(input.anchor) : undefined
			if (input.anchor && !anchor) throw new Error(`unknown anchor: ${input.anchor}`)
			const createdAt = now()
			const channel: Channel = {
				id: nextId(),
				handle: input.handle,
				aliases: [],
				type: input.type,
				title: input.title,
				purpose: input.purpose,
				parent: anchor ? { channelId: anchor.channelId, entryId: anchor.id, seq: anchor.seq } : undefined,
				members: (input.members ?? []).map((m) => ({ ...m, cursor: 0 })),
				context: input.context ?? [],
				traits: { membership: 'open', wake: true },
				state: input.state ?? 'active',
				pinned: [],
				conventions: input.conventions ?? [],
				stats: { entries: 0, lastSeq: 0 },
				createdAt,
			}
			channels.push(channel)
			entries.set(channel.id, [])
			return channel
		},
		defineView(ref, view) {
			views.push({ ...view, channelId: mustChannel(ref).id })
		},
		pin(ref, seq) {
			mustChannel(ref).pinned.push(seq)
		},
		setLifecycle(ref, state, author) {
			const channel = mustChannel(ref)
			store.append(ref, {
				author,
				type: 'cynapse.state.changed',
				body: `lifecycle → ${state}`,
				data: { lifecycle: state },
			})
			channel.state = state
		},
		addParticipant(participant) {
			participants.push(participant)
		},
		listChannels(query = {}) {
			return channels.filter(
				(s) =>
					(!query.type || s.type === query.type) &&
					(!query.state || s.state === query.state) &&
					(!query.parent || s.parent?.channelId === getChannel(query.parent)?.id),
			)
		},
		getChannel,
		children(ref) {
			const id = mustChannel(ref).id
			return channels.filter((s) => s.parent?.channelId === id)
		},
		entries(ref, query: EntryQuery = {}) {
			const channel = mustChannel(ref)
			const view = query.view ? views.find((v) => v.channelId === channel.id && v.name === query.view) : undefined
			let list = (entries.get(channel.id) ?? []).filter(
				(e) => e.seq > (query.afterSeq ?? 0) && matches(e, query) && (!view || matches(e, view.filter)),
			)
			if (query.limit !== undefined) list = list.slice(0, query.limit)
			return list
		},
		entry,
		search(query: SearchQuery) {
			const ids = query.channels?.map((s) => mustChannel(s).id)
			return channels
				.filter((s) => !ids || ids.includes(s.id))
				.flatMap((s) => (entries.get(s.id) ?? []).filter((e) => matches(e, query)))
		},
		states(query: StateQuery = {}) {
			const channelId = query.channel ? mustChannel(query.channel).id : undefined
			return states.filter(
				(r) =>
					(!channelId || r.channelId === channelId) &&
					(!query.kind || r.kind === query.kind) &&
					(!query.status || r.status === query.status) &&
					(!query.subject || r.subject === query.subject),
			)
		},
		unread(participant) {
			return channels.flatMap((s) => {
				const member = s.members.find((m) => m.participant === participant)
				if (!member) return []
				const count = (entries.get(s.id) ?? []).filter((e) => e.seq > member.cursor && e.author !== participant).length
				return count ? [{ channelId: s.id, handle: s.handle, count }] : []
			})
		},
		views(ref) {
			const id = mustChannel(ref).id
			return views.filter((v) => v.channelId === id)
		},
		participants() {
			return participants
		},
		append(ref, input: AppendInput) {
			const channel = mustChannel(ref)
			const list = entries.get(channel.id) ?? []
			const existing = input.id ? list.find((e) => e.id === input.id) : undefined
			if (existing) return existing
			const parent = input.parent ? entry(input.parent) : undefined
			const root = parent ? (parent.root ? entry(parent.root) : parent) : undefined
			const at = now()
			const created: Entry = {
				id: input.id ?? nextId(),
				channelId: channel.id,
				channel: channel.handle,
				seq: channel.stats.lastSeq + 1,
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
			channel.stats = { entries: list.length, lastSeq: created.seq, lastAt: at }
			return created
		},
		markRead(ref, participant, seq) {
			const channel = mustChannel(ref)
			const target = Math.min(seq ?? channel.stats.lastSeq, channel.stats.lastSeq)
			const member = channel.members.find((m) => m.participant === participant)
			if (!member) return { participant, role: '', cursor: target }
			// Like cynapse, a cursor only moves forward.
			member.cursor = Math.max(member.cursor, target)
			return member
		},
		setState(ref, input: SetStateInput, author) {
			const channel = mustChannel(ref)
			const logged = store.append(ref, {
				author,
				type: 'cynapse.state.changed',
				body: `${input.kind} ${input.key} → ${input.status}`,
				data: { ...input },
			})
			const record: StateRecord = { ...input, channelId: channel.id, seq: logged.seq, updatedAt: logged.createdAt }
			const index = states.findIndex((r) => r.channelId === channel.id && r.key === input.key)
			if (index >= 0) states[index] = record
			else states.push(record)
			return record
		},
	}
	return store
}
