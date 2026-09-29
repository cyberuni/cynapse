// A decision's provenance: the decision → the anchor that asked for it → the child
// arbitration stream's transcript → the contributions those entries reference.
import type { Entry, Store, Stream } from './model.ts'

export type Provenance = {
	decision: Entry
	/** The entry the decision replies to; for truss, the `arbitration-needed` anchor. */
	anchor?: Entry
	arbitration?: Stream
	/** Content entries of the arbitration stream, without cynapse meta entries. */
	transcript: Entry[]
	/** Entries referenced by the anchor, the transcript, and the decision. */
	contributions: Entry[]
	/** Replies to the decision in its own stream. */
	replies: Entry[]
	/** Entry ids named in payloads (such as `data.contributions`), as `handle#seq`. */
	idRefs: Record<string, string>
}

export function provenance(store: Store, ref: string): Provenance | undefined {
	const decision = store.entry(ref)
	if (!decision) return undefined
	const anchor = decision.parent ? store.entry(decision.parent) : undefined
	const arbitration = anchor ? store.children(anchor.streamId).find((s) => s.parent?.entryId === anchor.id) : undefined
	const transcript = arbitration ? store.entries(arbitration.id).filter((e) => !e.type.startsWith('cynapse.')) : []

	const seen = new Set<string>([decision.id, ...(anchor ? [anchor.id] : []), ...transcript.map((e) => e.id)])
	const contributions: Entry[] = []
	for (const source of [...(anchor ? [anchor] : []), ...transcript, decision]) {
		const ids = source.data?.contributions
		const pointers = [
			...source.refs,
			...(Array.isArray(ids) ? ids.filter((i): i is string => typeof i === 'string') : []),
		]
		for (const r of pointers) {
			// A scheme ref (gh:, npm:, https:) points outside cynapse.
			if (/^[a-z]+:/.test(r)) continue
			const found = store.entry(r)
			if (found && !found.type.startsWith('cynapse.') && !seen.has(found.id)) {
				seen.add(found.id)
				contributions.push(found)
			}
		}
	}
	contributions.sort((a, b) => a.stream.localeCompare(b.stream) || a.seq - b.seq)

	const replies = store.entries(decision.streamId).filter((e) => e.root === decision.id || e.parent === decision.id)

	const idRefs = payloadIdRefs(store, [decision, ...(anchor ? [anchor] : []), ...transcript])
	return { decision, anchor, arbitration, transcript, contributions, replies, idRefs }
}

const ENTRY_ID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i

/** Entry ids found in the entries' payloads (top-level strings and string lists), as `handle#seq`. */
export function payloadIdRefs(store: Store, entries: Entry[]): Record<string, string> {
	const out: Record<string, string> = {}
	for (const entry of entries) {
		for (const value of Object.values(entry.data ?? {})) {
			for (const candidate of Array.isArray(value) ? value : [value]) {
				if (typeof candidate !== 'string' || !ENTRY_ID.test(candidate) || candidate in out) continue
				const found = store.entry(candidate)
				if (found) out[candidate] = `${found.stream}#${found.seq}`
			}
		}
	}
	return out
}
