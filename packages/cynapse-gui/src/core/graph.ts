// Folds an `sdd.mission-graph` channel into a DAG at any point in its history.
import type { Entry } from './model.ts'

/** `open` is for nodes that are not dispatched themselves, such as an operation. */
type NodeStatus = 'open' | 'blocked' | 'ready' | 'claimed' | 'retired' | 'tombstoned'

export type GraphNode = {
	id: string
	/** `mission` or `operation`. */
	kind: string
	title: string
	/** The node's own channel, when it has one. */
	channel?: string
	status: NodeStatus
	by?: string
	/** Retirement outcome, or the tombstone reason. */
	outcome?: string
	/** The latest frontier's reason this node is ready or held. */
	why?: string
	blast?: string
	/** Longest dependency path from a root; used for layout. */
	layer: number
}

type GraphEdge = { from: string; to: string; kind: string }

export type MissionGraph = {
	nodes: GraphNode[]
	edges: GraphEdge[]
	/** The `seq` of every graph entry, for stepping through history. */
	steps: number[]
	/** The `seq` the graph was folded up to. */
	at: number
}

const str = (value: unknown) => (typeof value === 'string' ? value : undefined)
const strings = (value: unknown) =>
	Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []

export function foldGraph(entries: Entry[], uptoSeq = Number.POSITIVE_INFINITY): MissionGraph {
	const graphEntries = entries.filter((e) => e.type.startsWith('sdd.graph.'))
	const nodes = new Map<string, GraphNode>()
	const edges: GraphEdge[] = []
	let frontier = new Set<string>()
	let why: Record<string, unknown> = {}
	let at = 0

	for (const entry of graphEntries) {
		if (entry.seq > uptoSeq) break
		at = entry.seq
		const data = entry.data ?? {}
		const node = nodes.get(str(data.node) ?? '')
		switch (entry.type) {
			case 'sdd.graph.node': {
				const id = str(data.node)
				const kind = str(data.kind) ?? 'mission'
				if (id)
					nodes.set(id, {
						id,
						kind,
						title: str(data.title) ?? id,
						channel: str(data.channel),
						blast: str(data.blast),
						status: kind === 'mission' ? 'blocked' : 'open',
						layer: 0,
					})
				break
			}
			case 'sdd.graph.edge': {
				const from = str(data.from)
				const to = str(data.to)
				if (from && to) edges.push({ from, to, kind: str(data.kind) ?? 'RAW' })
				break
			}
			case 'sdd.graph.frontier':
				frontier = new Set(strings(data.ready))
				why = (data.whyReady as Record<string, unknown> | undefined) ?? {}
				break
			case 'sdd.graph.claim':
				if (node) Object.assign(node, { status: 'claimed', by: str(data.by) })
				break
			case 'sdd.graph.retire':
				if (node) Object.assign(node, { status: 'retired', outcome: str(data.outcome) })
				break
			case 'sdd.graph.tombstone':
				if (node) Object.assign(node, { status: 'tombstoned', outcome: str(data.reason) })
				break
		}
	}

	for (const node of nodes.values()) {
		if (node.status === 'blocked' && frontier.has(node.id)) node.status = 'ready'
		node.why = str(why[node.id])
	}

	const layerOf = (id: string, seen: Set<string>): number => {
		if (seen.has(id)) return 0
		const deps = edges.filter((e) => e.to === id)
		return deps.length ? 1 + Math.max(...deps.map((d) => layerOf(d.from, new Set([...seen, id])))) : 0
	}
	for (const node of nodes.values()) node.layer = layerOf(node.id, new Set())

	return { nodes: [...nodes.values()], edges, steps: graphEntries.map((e) => e.seq), at }
}
