// Channels as a tree, nested through their anchors: initiative → epic → mission, and a
// truss mission → its arbitrations. Each node rolls up its subtree.
import type { Channel, Store } from './model.ts'

type Rollup = {
	unread: number
	needsInput: number
	pendingAnswers: number
	/** Count of channels in the subtree per lifecycle state. */
	lifecycle: Record<string, number>
}

export type TreeNode = {
	handle: string
	title: string
	type: string
	state: string
	/** `handle#seq` of the anchor in the parent channel. */
	anchor?: string
	unread: number
	needsInput: number
	pendingAnswers: number
	children: TreeNode[]
	rollup: Rollup
}

export function hierarchy(store: Store, participant: string): TreeNode[] {
	const channels = store.listChannels()
	const byId = new Map(channels.map((s) => [s.id, s]))
	const unread = new Map(store.unread(participant).map((u) => [u.channelId, u.count]))
	const open = store.states({ status: 'open' })
	const countOpen = (channel: Channel, kind: string, subject?: string) =>
		open.filter((r) => r.channelId === channel.id && r.kind === kind && (!subject || r.subject === subject)).length

	const build = (channel: Channel): TreeNode => {
		const children = channels.filter((s) => s.parent?.channelId === channel.id).map(build)
		const parent = channel.parent && byId.get(channel.parent.channelId)
		const own = {
			unread: unread.get(channel.id) ?? 0,
			needsInput: countOpen(channel, 'needs-input', participant),
			pendingAnswers: countOpen(channel, 'pending-answers'),
		}
		const rollup: Rollup = { ...own, lifecycle: { [channel.state]: 1 } }
		for (const child of children) {
			rollup.unread += child.rollup.unread
			rollup.needsInput += child.rollup.needsInput
			rollup.pendingAnswers += child.rollup.pendingAnswers
			for (const [state, n] of Object.entries(child.rollup.lifecycle)) {
				rollup.lifecycle[state] = (rollup.lifecycle[state] ?? 0) + n
			}
		}
		return {
			handle: channel.handle,
			title: channel.title,
			type: channel.type,
			state: channel.state,
			anchor: parent && channel.parent ? `${parent.handle}#${channel.parent.seq}` : undefined,
			...own,
			children,
			rollup,
		}
	}

	return channels.filter((s) => !s.parent || !byId.has(s.parent.channelId)).map(build)
}
