import { useCallback, useMemo } from 'react'
import type { GraphNode, MissionGraph } from '../../core/graph.ts'
import type { Entry } from '../../core/model.ts'
import { Link, Loading, RefText } from '../components.tsx'
import { navigate, useApi, useKeys, useListNav } from '../data.ts'

const W = 200
const H = 70
const GAP_X = 70
const GAP_Y = 24

function layout(nodes: GraphNode[]) {
	const layers = new Map<number, GraphNode[]>()
	for (const n of nodes) layers.set(n.layer, [...(layers.get(n.layer) ?? []), n])
	const pos = new Map<string, { x: number; y: number }>()
	for (const [layer, list] of layers) {
		list.forEach((n, i) => {
			pos.set(n.id, { x: 20 + layer * (W + GAP_X), y: 20 + i * (H + GAP_Y) })
		})
	}
	const width = 40 + Math.max(0, ...layers.keys()) * (W + GAP_X) + W
	const height = 40 + Math.max(0, ...[...layers.values()].map((l) => l.length)) * (H + GAP_Y)
	return { pos, width, height }
}

export function Graph(props: { handle: string; at?: number }) {
	const at = props.at !== undefined ? `?at=${props.at}` : ''
	const { data, error } = useApi<MissionGraph>(`/api/graph/${encodeURIComponent(props.handle)}${at}`)
	const { data: entries } = useApi<Entry[]>(`/api/streams/${encodeURIComponent(props.handle)}/entries`)
	const nodes = data?.nodes ?? []
	const open = useCallback(
		(i: number) => {
			const node = nodes[i]
			if (node?.stream) navigate({ view: 'stream', handle: node.stream })
		},
		[nodes],
	)
	const [index] = useListNav(nodes.length, open)

	const steps = data?.steps ?? []
	const stepIndex = data ? steps.indexOf(data.at) : -1
	const go = useCallback(
		(i: number) => {
			const seq = steps[Math.max(0, Math.min(i, steps.length - 1))]
			if (seq === undefined) return
			navigate(
				seq === steps.at(-1)
					? { view: 'graph', handle: props.handle }
					: { view: 'graph', handle: props.handle, at: seq },
			)
		},
		[steps, props.handle],
	)
	useKeys(
		useMemo(
			() => ({
				'[': () => go(stepIndex - 1),
				']': () => go(stepIndex + 1),
				'{': () => go(0),
				'}': () => go(steps.length - 1),
			}),
			[go, stepIndex, steps.length],
		),
	)

	if (!data) return <Loading error={error} />
	const { pos, width, height } = layout(nodes)
	const current = entries?.find((e) => e.seq === data.at)
	const counts: Record<string, number> = {}
	for (const n of nodes) counts[n.status] = (counts[n.status] ?? 0) + 1
	return (
		<div className="view">
			<h1>
				Mission graph <span className="muted">— {props.handle}</span>
			</h1>
			<div className="toolbar">
				<button type="button" onClick={() => go(0)} disabled={stepIndex <= 0}>
					<kbd>{'{'}</kbd> first
				</button>
				<button type="button" onClick={() => go(stepIndex - 1)} disabled={stepIndex <= 0}>
					<kbd>[</kbd> prev
				</button>
				<input
					type="range"
					aria-label="history step"
					min={0}
					max={Math.max(steps.length - 1, 0)}
					value={Math.max(stepIndex, 0)}
					onChange={(e) => go(Number(e.target.value))}
				/>
				<button type="button" onClick={() => go(stepIndex + 1)} disabled={stepIndex >= steps.length - 1}>
					next <kbd>]</kbd>
				</button>
				<button type="button" onClick={() => go(steps.length - 1)} disabled={stepIndex >= steps.length - 1}>
					latest <kbd>{'}'}</kbd>
				</button>
				<span className="muted">
					step {stepIndex + 1}/{steps.length} · #{data.at}
				</span>
			</div>
			{current ? (
				<p className="step-note">
					<Link className="seq" to={{ view: 'stream', handle: props.handle, seq: current.seq }}>
						#{current.seq}
					</Link>{' '}
					<span className="author">{current.author}</span> <code>{current.type}</code> <RefText text={current.body} />
				</p>
			) : null}
			<div className="legend">
				{(['ready', 'claimed', 'retired', 'blocked', 'tombstoned'] as const).map((s) => (
					<span key={s} className={`pill node-${s}`}>
						{counts[s] ?? 0} {s}
					</span>
				))}
			</div>
			<div className="graph-wrap">
				<svg width={width} height={height} role="img" aria-label="mission graph">
					<defs>
						<marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto">
							<path d="M0,0 L10,5 L0,10 z" className="edge-head" />
						</marker>
					</defs>
					{data.edges.map((e) => {
						const a = pos.get(e.from)
						const b = pos.get(e.to)
						if (!a || !b) return null
						const x1 = a.x + W
						const y1 = a.y + H / 2
						const x2 = b.x
						const y2 = b.y + H / 2
						const mx = (x1 + x2) / 2
						return (
							<path
								key={`${e.from}-${e.to}`}
								className={`edge edge-${e.kind}`}
								d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
								markerEnd="url(#arrow)"
							/>
						)
					})}
					{nodes.map((n, i) => {
						const p = pos.get(n.id)
						if (!p) return null
						const box = (
							<g
								key={n.id}
								className={`node node-${n.status} kind-${n.kind}${i === index ? ' selected' : ''}`}
								transform={`translate(${p.x},${p.y})`}
							>
								<title>{[n.id, n.why].filter(Boolean).join(' — ')}</title>
								<rect width={W} height={H} rx={8} />
								<text x={10} y={22} className="node-title">
									{n.title}
								</text>
								<text x={10} y={42} className="node-sub">
									{n.status}
									{n.by ? ` · ${n.by}` : ''}
									{n.outcome ? ` · ${n.outcome}` : ''}
								</text>
								{n.stream ? (
									<text x={10} y={58} className="node-sub">
										{n.stream}
									</text>
								) : null}
							</g>
						)
						return n.stream ? (
							<Link key={n.id} to={{ view: 'stream', handle: n.stream }}>
								{box}
							</Link>
						) : (
							box
						)
					})}
				</svg>
			</div>
			{nodes[index] ? (
				<div className="step-note">
					<strong>{nodes[index].title}</strong> <code>{nodes[index].id}</code>{' '}
					<span className={`pill node-${nodes[index].status}`}>{nodes[index].status}</span>
					{nodes[index].kind !== 'mission' ? <span className="pill">{nodes[index].kind}</span> : null}
					{nodes[index].blast ? <span className="pill">blast {nodes[index].blast}</span> : null}
					{nodes[index].by ? <span className="muted"> claimed by {nodes[index].by}</span> : null}
					{nodes[index].outcome ? <span className="muted"> · {nodes[index].outcome}</span> : null}
					{nodes[index].why ? <div className="muted">frontier: {nodes[index].why}</div> : null}
					{data.edges.some((e) => e.to === nodes[index]?.id) ? (
						<div className="muted">
							after{' '}
							{data.edges
								.filter((e) => e.to === nodes[index]?.id)
								.map((e) => `${e.from} (${e.kind})`)
								.join(', ')}
						</div>
					) : null}
				</div>
			) : null}
			<p className="muted">
				<kbd>j</kbd>/<kbd>k</kbd> select a node, <kbd>Enter</kbd> or a click opens its mission stream, <kbd>[</kbd>/
				<kbd>]</kbd> step through history.
			</p>
		</div>
	)
}
