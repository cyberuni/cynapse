// Streams as a tree, nested through their anchors: initiative → epic → mission, and a
// truss mission → its arbitrations. Each node rolls up its subtree.
import type { Store, Stream } from './model.ts'

export type Rollup = {
	unread: number
	needsInput: number
	pendingAnswers: number
	/** Count of streams in the subtree per lifecycle state. */
	lifecycle: Record<string, number>
}

export type TreeNode = {
	handle: string
	title: string
	type: string
	state: string
	/** `handle#seq` of the anchor in the parent stream. */
	anchor?: string
	unread: number
	needsInput: number
	pendingAnswers: number
	children: TreeNode[]
	rollup: Rollup
}

export function hierarchy(store: Store, participant: string): TreeNode[] {
	const streams = store.listStreams()
	const byId = new Map(streams.map((s) => [s.id, s]))
	const unread = new Map(store.unread(participant).map((u) => [u.streamId, u.count]))
	const open = store.states({ status: 'open' })
	const countOpen = (stream: Stream, kind: string, subject?: string) =>
		open.filter((r) => r.streamId === stream.id && r.kind === kind && (!subject || r.subject === subject)).length

	const build = (stream: Stream): TreeNode => {
		const children = streams.filter((s) => s.parent?.streamId === stream.id).map(build)
		const parent = stream.parent && byId.get(stream.parent.streamId)
		const own = {
			unread: unread.get(stream.id) ?? 0,
			needsInput: countOpen(stream, 'needs-input', participant),
			pendingAnswers: countOpen(stream, 'pending-answers'),
		}
		const rollup: Rollup = { ...own, lifecycle: { [stream.state]: 1 } }
		for (const child of children) {
			rollup.unread += child.rollup.unread
			rollup.needsInput += child.rollup.needsInput
			rollup.pendingAnswers += child.rollup.pendingAnswers
			for (const [state, n] of Object.entries(child.rollup.lifecycle)) {
				rollup.lifecycle[state] = (rollup.lifecycle[state] ?? 0) + n
			}
		}
		return {
			handle: stream.handle,
			title: stream.title,
			type: stream.type,
			state: stream.state,
			anchor: parent && stream.parent ? `${parent.handle}#${stream.parent.seq}` : undefined,
			...own,
			children,
			rollup,
		}
	}

	return streams.filter((s) => !s.parent || !byId.has(s.parent.streamId)).map(build)
}
