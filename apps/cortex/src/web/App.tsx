import { useEffect, useMemo, useState } from 'react'
import type { Stream as StreamData } from '../core/model.ts'
import type { Triage as TriageData } from '../core/triage.ts'
import { Link } from './components.tsx'
import { isTyping, navigate, useApi } from './data.ts'
import { createKeymap } from './keys.ts'
import { parseRoute, type Route } from './route.ts'
import { Graph } from './views/Graph.tsx'
import { Provenance } from './views/Provenance.tsx'
import { Search } from './views/Search.tsx'
import { Stream } from './views/Stream.tsx'
import { Tree } from './views/Tree.tsx'
import { Triage } from './views/Triage.tsx'

const HELP: [string, string][] = [
	['g t', 'triage — what needs your hands'],
	['g h', 'hierarchy tree'],
	['g g', 'mission graph'],
	['g s  /', 'search'],
	['j k  ↓ ↑', 'move selection'],
	['Enter', 'open selected'],
	['h l  ← →', 'collapse / expand (tree)'],
	['u', 'up to the parent stream (anchor)'],
	['v', 'raw / distilled (stream)'],
	['t', 'threads (stream)'],
	['m', 'show cynapse meta entries (stream)'],
	['o', 'open child stream inline'],
	['s', 'open child stream side by side'],
	['x', 'close side-by-side'],
	['p', 'provenance of the selected decision'],
	['a', 'answer the selected needs-input'],
	['R  O', 'ratify / override the selected decision'],
	['r', 'mark the stream read'],
	['[ ]  { }', 'step the graph history'],
	['<  >', 'previous / next mission graph'],
	['Backspace', 'back'],
	['?', 'this help'],
]

const CHORDS = ['g t', 'g h', 'g g', 'g s', '/', '?', 'u', 'Backspace']

function useRoute(): Route {
	const read = () => parseRoute(window.location.pathname, window.location.search, window.location.hash)
	const [route, setRoute] = useState(read)
	useEffect(() => {
		const update = () => setRoute(read())
		window.addEventListener('popstate', update)
		return () => window.removeEventListener('popstate', update)
	}, [])
	return route
}

export function App() {
	const route = useRoute()
	const [help, setHelp] = useState(false)
	const { data: graphs } = useApi<StreamData[]>('/api/streams?type=sdd.mission-graph')
	const { data: triage } = useApi<TriageData>('/api/triage')
	const { data: current } = useApi<{ anchor?: string }>(
		route.view === 'stream' ? `/api/streams/${encodeURIComponent(route.handle)}` : undefined,
	)
	const graph = graphs?.[0]?.handle
	const keymap = useMemo(() => createKeymap(CHORDS), [])

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setHelp(false)
			if (isTyping(event) || event.metaKey || event.ctrlKey || event.altKey) return
			const binding = keymap.press(event.key)
			const act: Record<string, () => void> = {
				'g t': () => navigate('/'),
				'g h': () => navigate('/tree'),
				'g g': () => graph && navigate({ view: 'graph', handle: graph }),
				'g s': () => navigate('/search'),
				'/': () => {
					if (route.view !== 'search') navigate('/search')
					setTimeout(() => document.getElementById('search-input')?.focus(), 0)
				},
				'?': () => setHelp((h) => !h),
				u: () => current?.anchor && navigate(`/s/${current.anchor}`),
				Backspace: () => window.history.back(),
			}
			if (binding && act[binding]) {
				event.preventDefault()
				act[binding]()
			}
		}
		window.addEventListener('keydown', handler)
		return () => window.removeEventListener('keydown', handler)
	}, [keymap, graph, route.view, current?.anchor])

	const hands = triage ? triage.needsInput.length + triage.arbitrations.length : 0
	const unread = triage ? triage.unread.reduce((n, u) => n + u.count, 0) : 0
	return (
		<div className="app">
			<nav className="nav">
				<span className="brand">◉ Cortex</span>
				<Link to="/" className={route.view === 'triage' ? 'active' : ''}>
					Triage {hands ? <span className="pill alert">{hands}</span> : null}
				</Link>
				<Link to="/tree" className={route.view === 'tree' ? 'active' : ''}>
					Hierarchy {unread ? <span className="pill">{unread}</span> : null}
				</Link>
				{graph ? (
					<Link to={{ view: 'graph', handle: graph }} className={route.view === 'graph' ? 'active' : ''}>
						Graph
					</Link>
				) : null}
				<Link to="/search" className={route.view === 'search' ? 'active' : ''}>
					Search
				</Link>
				<span className="grow" />
				<button type="button" className="inline" onClick={() => setHelp((h) => !h)}>
					<kbd>?</kbd> keys
				</button>
			</nav>
			<main>
				{route.view === 'triage' ? <Triage /> : null}
				{route.view === 'tree' ? <Tree /> : null}
				{route.view === 'stream' ? (
					<Stream key={`${route.handle}`} handle={route.handle} seq={route.seq} side={route.side} />
				) : null}
				{route.view === 'provenance' ? (
					<Provenance key={`${route.handle}#${route.seq}`} handle={route.handle} seq={route.seq} />
				) : null}
				{route.view === 'graph' ? <Graph handle={route.handle} at={route.at} /> : null}
				{route.view === 'search' ? (
					<Search key={`${route.types}|${route.tags}`} types={route.types} tags={route.tags} />
				) : null}
			</main>
			{help ? (
				<div className="help">
					<div className="help-card">
						<div className="row">
							<h2 className="grow">Keyboard</h2>
							<button type="button" className="inline" onClick={() => setHelp(false)}>
								<kbd>Esc</kbd> close
							</button>
						</div>
						<table>
							<tbody>
								{HELP.map(([keys, what]) => (
									<tr key={keys}>
										<td>
											{keys.split('  ').map((k) => (
												<kbd key={k}>{k}</kbd>
											))}
										</td>
										<td>{what}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			) : null}
		</div>
	)
}
