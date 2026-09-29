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
		for (const r of source.refs) {
			if (r.startsWith('gh:')) continue
			const found = store.entry(r)
			if (found && !seen.has(found.id)) {
				seen.add(found.id)
				contributions.push(found)
			}
		}
	}
	contributions.sort((a, b) => a.stream.localeCompare(b.stream) || a.seq - b.seq)

	const replies = store.entries(decision.streamId).filter((e) => e.root === decision.id || e.parent === decision.id)

	return { decision, anchor, arbitration, transcript, contributions, replies }
}
