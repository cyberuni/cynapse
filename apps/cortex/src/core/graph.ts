// Folds an `sdd.mission-graph` stream into a DAG at any point in its history.
import type { Entry } from './model.ts'

type NodeStatus = 'blocked' | 'ready' | 'claimed' | 'retired'

export type GraphNode = {
	id: string
	title: string
	mission?: string
	status: NodeStatus
	by?: string
	outcome?: string
	/** Longest dependency path from a root; used for layout. */
	layer: number
}

export type MissionGraph = {
	nodes: GraphNode[]
	edges: { from: string; to: string }[]
	/** The `seq` of every graph entry, for stepping through history. */
	steps: number[]
	/** The `seq` the graph was folded up to. */
	at: number
}

const str = (value: unknown) => (typeof value === 'string' ? value : undefined)

export function foldGraph(entries: Entry[], uptoSeq = Number.POSITIVE_INFINITY): MissionGraph {
	const graphEntries = entries.filter((e) => e.type.startsWith('sdd.graph.'))
	const nodes = new Map<string, GraphNode>()
	const edges: { from: string; to: string }[] = []
	let frontier = new Set<string>()
	let at = 0

	for (const entry of graphEntries) {
		if (entry.seq > uptoSeq) break
		at = entry.seq
		const data = entry.data ?? {}
		const node = nodes.get(str(data.node) ?? '')
		switch (entry.type) {
			case 'sdd.graph.node': {
				const id = str(data.node)
				if (id)
					nodes.set(id, { id, title: str(data.title) ?? id, mission: str(data.mission), status: 'blocked', layer: 0 })
				break
			}
			case 'sdd.graph.edge': {
				const from = str(data.from)
				const to = str(data.to)
				if (from && to) edges.push({ from, to })
				break
			}
			case 'sdd.graph.frontier':
				frontier = new Set(
					Array.isArray(data.ready) ? data.ready.filter((r): r is string => typeof r === 'string') : [],
				)
				break
			case 'sdd.graph.claim':
				if (node) Object.assign(node, { status: 'claimed', by: str(data.by) })
				break
			case 'sdd.graph.retire':
				if (node) Object.assign(node, { status: 'retired', outcome: str(data.outcome) })
				break
		}
	}

	for (const node of nodes.values()) {
		if (node.status === 'blocked' && frontier.has(node.id)) node.status = 'ready'
	}

	const layerOf = (id: string, seen: Set<string>): number => {
		if (seen.has(id)) return 0
		const deps = edges.filter((e) => e.to === id)
		return deps.length ? 1 + Math.max(...deps.map((d) => layerOf(d.from, new Set([...seen, id])))) : 0
	}
	for (const node of nodes.values()) node.layer = layerOf(node.id, new Set())

	return { nodes: [...nodes.values()], edges, steps: graphEntries.map((e) => e.seq), at }
}
