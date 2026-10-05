import { useCallback, useMemo, useState } from 'react'
import type { TreeNode } from '../../core/hierarchy.ts'
import { Link, Loading, TypeChip } from '../components.tsx'
import { navigate, useApi, useKeys, useListNav } from '../data.ts'

type Row = { node: TreeNode; depth: number }

function flatten(nodes: TreeNode[], collapsed: Set<string>, depth = 0): Row[] {
	return nodes.flatMap((node) => [
		{ node, depth },
		...(collapsed.has(node.handle) ? [] : flatten(node.children, collapsed, depth + 1)),
	])
}

function Badges({ node }: { node: TreeNode }) {
	const r = node.rollup
	return (
		<span className="badges">
			{r.needsInput ? <span className="pill alert">{r.needsInput} needs input</span> : null}
			{r.pendingAnswers ? <span className="pill warn">{r.pendingAnswers} pending</span> : null}
			{r.unread ? <span className="pill">{r.unread} unread</span> : null}
			{node.children.length
				? Object.entries(r.lifecycle).map(([state, n]) => (
						<span key={state} className={`pill state-${state}`}>
							{n} {state}
						</span>
					))
				: null}
		</span>
	)
}

export function Tree() {
	const { data, error } = useApi<TreeNode[]>('/api/tree')
	const [collapsed, setCollapsed] = useState(new Set<string>())
	const rows = useMemo(() => (data ? flatten(data, collapsed) : []), [data, collapsed])
	const open = useCallback((i: number) => rows[i] && navigate({ view: 'channel', handle: rows[i].node.handle }), [rows])
	const [index] = useListNav(rows.length, open)
	const toggle = useCallback((handle: string, to?: boolean) => {
		setCollapsed((prev) => {
			const next = new Set(prev)
			const collapse = to ?? !next.has(handle)
			if (collapse) next.add(handle)
			else next.delete(handle)
			return next
		})
	}, [])
	const current = rows[index]?.node
	useKeys(
		useMemo(
			() => ({
				h: () => current && toggle(current.handle, true),
				ArrowLeft: () => current && toggle(current.handle, true),
				l: () => current && toggle(current.handle, false),
				ArrowRight: () => current && toggle(current.handle, false),
			}),
			[current, toggle],
		),
	)

	if (!data) return <Loading error={error} />
	return (
		<div className="view">
			<h1>
				Hierarchy <span className="muted">— channels nested through their anchors</span>
			</h1>
			<div className="tree">
				{rows.map(({ node, depth }, i) => (
					<div
						key={node.handle}
						className={`tree-row state-${node.state}`}
						data-selected={i === index}
						style={{ paddingLeft: `${depth * 1.5 + 0.5}rem` }}
					>
						<button
							type="button"
							className="twisty"
							aria-label={collapsed.has(node.handle) ? 'expand' : 'collapse'}
							onClick={() => toggle(node.handle)}
							disabled={!node.children.length}
						>
							{node.children.length ? (collapsed.has(node.handle) ? '▸' : '▾') : '·'}
						</button>
						<TypeChip type={node.type} />
						<Link className="seq" to={{ view: 'channel', handle: node.handle }}>
							{node.handle}
						</Link>
						<span className="grow">{node.title}</span>
						<span className={`pill state-${node.state}`}>{node.state}</span>
						<Badges node={node} />
					</div>
				))}
			</div>
		</div>
	)
}
