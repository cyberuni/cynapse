import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MemberRow, Wait } from '../../core/members.ts'
import type { Entry, StateRecord, Stream as StreamData } from '../../core/model.ts'
import { EntryLine, Link, Loading, Refs, RefText, Tag, TypeChip } from '../components.tsx'
import { navigate, post, useApi, useKeys, useListNav } from '../data.ts'
import { AnswerBox } from './Triage.tsx'

type Child = { handle: string; title: string; type: string; state: string; anchorSeq?: number }

type StreamInfo = {
	stream: StreamData
	anchor?: string
	members: MemberRow[]
	waits: Wait[]
	children: Child[]
	pinned: Entry[]
	views: string[]
	states: StateRecord[]
}

/** Orders entries as a reply tree: each root followed by its replies, depth-first. */
function threaded(entries: Entry[]): { entry: Entry; depth: number }[] {
	const bySeq = new Map(entries.map((e) => [e.seq, e]))
	const kids = new Map<number, Entry[]>()
	const roots: Entry[] = []
	for (const e of entries) {
		if (e.parentSeq && bySeq.has(e.parentSeq)) kids.set(e.parentSeq, [...(kids.get(e.parentSeq) ?? []), e])
		else roots.push(e)
	}
	const out: { entry: Entry; depth: number }[] = []
	const walk = (e: Entry, depth: number) => {
		out.push({ entry: e, depth })
		for (const k of kids.get(e.seq) ?? []) walk(k, depth + 1)
	}
	for (const r of roots) walk(r, 0)
	return out
}

function Timeline(props: { handle: string; compact?: boolean }) {
	const { data } = useApi<Entry[]>(`/api/streams/${encodeURIComponent(props.handle)}/entries`)
	if (!data) return <Loading />
	const content = data.filter((e) => !e.type.startsWith('cynapse.'))
	return (
		<div className={props.compact ? 'timeline compact' : 'timeline'}>
			{content.map((e) => (
				<EntryLine key={e.id} entry={e} />
			))}
		</div>
	)
}

function RulingBox(props: { entry: Entry; ruling: 'ratify' | 'override'; onDone: () => void }) {
	const [body, setBody] = useState('')
	const [error, setError] = useState<string>()
	const submit = async () => {
		try {
			await post('/api/rule', { ref: `${props.entry.stream}#${props.entry.seq}`, ruling: props.ruling, body })
			props.onDone()
		} catch (err) {
			setError((err as Error).message)
		}
	}
	return (
		<form
			className="action-box"
			onSubmit={(e) => {
				e.preventDefault()
				void submit()
			}}
		>
			<textarea
				// biome-ignore lint/a11y/noAutofocus: the box opens on an explicit keypress
				autoFocus
				value={body}
				placeholder={
					props.ruling === 'ratify' ? 'Optional note (Ctrl+Enter to ratify)' : 'The Council outcome (required)'
				}
				onChange={(e) => setBody(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === 'Escape') props.onDone()
					if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submit()
				}}
			/>
			<div className="row">
				<button type="submit" disabled={props.ruling === 'override' && !body.trim()}>
					{props.ruling === 'ratify' ? 'Ratify' : 'Override'}
				</button>
				<button type="button" onClick={props.onDone}>
					Cancel
				</button>
				{error ? <span className="error">{error}</span> : null}
			</div>
		</form>
	)
}

function Sidebar({ info }: { info: StreamInfo }) {
	const open = info.states.filter((s) => s.status === 'open')
	return (
		<aside className="side-panel">
			<h3>Members</h3>
			<div className="table">
				{info.members.map((m) => (
					<div key={m.participant} className="tr">
						<span className={`author kind-${m.kind ?? 'agent'}`}>{m.participant}</span>
						<span className="muted grow">{m.role}</span>
						<span className="muted" title="cursor: last read seq">
							@{m.cursor}
						</span>
						{m.unread ? <span className="count">{m.unread}</span> : null}
					</div>
				))}
			</div>
			<h3>Waiting</h3>
			{info.waits.length === 0 ? <p className="empty">0 waits</p> : null}
			{info.waits.map((w) => (
				<div key={`${w.waiter}-${w.on}-${w.kind}`} className="wait">
					<span className="author">{w.waiter}</span> → <span className="pill warn">{w.on}</span>{' '}
					<span className="muted">
						{w.kind}
						{w.seq ? (
							<>
								{' '}
								<RefText text={`${w.stream}#${w.seq}`} />
							</>
						) : null}
					</span>
				</div>
			))}
			<h3>Open state</h3>
			{open.length === 0 ? <p className="empty">0 open records</p> : null}
			{open.map((s) => (
				<div key={s.key} className="wait">
					<span className="pill">{s.kind}</span> {s.key}
					{s.subject ? <span className="muted"> · {s.subject}</span> : null}
				</div>
			))}
			{info.pinned.length ? (
				<>
					<h3>Pinned</h3>
					{info.pinned.map((e) => (
						<div key={e.id} className="pinned">
							<RefText text={`${e.stream}#${e.seq}`} /> <RefText text={e.body} />
						</div>
					))}
				</>
			) : null}
			{info.children.length ? (
				<>
					<h3>Child streams</h3>
					{info.children.map((c) => (
						<div key={c.handle} className="wait">
							<Link className="seq" to={{ view: 'stream', handle: c.handle }}>
								{c.handle}
							</Link>{' '}
							<span className={`pill state-${c.state}`}>{c.state}</span>
						</div>
					))}
				</>
			) : null}
		</aside>
	)
}

export function Stream(props: { handle: string; seq?: number; side?: string }) {
	const base = `/api/streams/${encodeURIComponent(props.handle)}`
	const { data: info, error } = useApi<StreamInfo>(base)
	const [view, setView] = useState<string>('')
	const [types, setTypes] = useState<string[]>([])
	const [tag, setTag] = useState<string>()
	const [showMeta, setShowMeta] = useState(false)
	const [threads, setThreads] = useState(false)
	const [inline, setInline] = useState(new Set<number>())
	const [action, setAction] = useState<{ seq: number; kind: 'answer' | 'ratify' | 'override' }>()

	useEffect(() => {
		setView(info?.stream.state === 'reconciled' && info.views.includes('distilled') ? 'distilled' : '')
		setTypes([])
		setTag(undefined)
	}, [info?.stream.handle, info?.stream.state, info?.views])

	const query = new URLSearchParams()
	if (view) query.set('view', view)
	if (tag) query.set('tags', tag)
	const { data: all } = useApi<Entry[]>(`${base}/entries?${query}`)

	const shown = useMemo(() => {
		const list = (all ?? []).filter(
			(e) => (showMeta || !e.type.startsWith('cynapse.')) && (!types.length || types.includes(e.type)),
		)
		return threads ? threaded(list) : list.map((entry) => ({ entry, depth: 0 }))
	}, [all, showMeta, types, threads])
	const typeFacets = useMemo(
		() => [...new Set((all ?? []).map((e) => e.type))].filter((t) => showMeta || !t.startsWith('cynapse.')),
		[all, showMeta],
	)
	const tagFacets = useMemo(() => [...new Set((all ?? []).flatMap((e) => e.tags))], [all])

	const childAt = useMemo(() => new Map((info?.children ?? []).map((c) => [c.anchorSeq, c])), [info?.children])
	const openAsk = useMemo(
		() =>
			new Map(
				(info?.states ?? [])
					.filter((s) => s.status === 'open' && s.kind === 'needs-input' && s.subject === 'council')
					.flatMap((s) => {
						const asked = all?.find((e) => e.id === s.entryId)
						return asked ? [[asked.seq, s.key] as const] : []
					}),
			),
		[info?.states, all],
	)

	const initial = Math.max(
		0,
		shown.findIndex((row) => row.entry.seq === props.seq),
	)
	const openEntry = useCallback(
		(i: number) => {
			const e = shown[i]?.entry
			if (!e) return
			const child = childAt.get(e.seq)
			if (child) navigate({ view: 'stream', handle: props.handle, seq: e.seq, side: child.handle })
			else if (e.type.endsWith('.decision')) navigate({ view: 'provenance', handle: e.stream, seq: e.seq })
		},
		[shown, childAt, props.handle],
	)
	const [index, setIndex] = useListNav(shown.length, openEntry, initial)
	useEffect(() => {
		if (props.seq === undefined) return
		const i = shown.findIndex((row) => row.entry.seq === props.seq)
		if (i >= 0) setIndex(i)
	}, [props.seq, shown, setIndex])
	const current = shown[index]?.entry
	useEffect(() => {
		if (current && current.stream === props.handle) {
			const hash = `#${current.seq}`
			if (window.location.hash !== hash)
				window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`)
		}
	}, [current, props.handle])

	useKeys(
		useMemo(
			() => ({
				v: () => info?.views.includes('distilled') && setView((v) => (v ? '' : 'distilled')),
				t: () => setThreads((x) => !x),
				m: () => setShowMeta((x) => !x),
				r: () => void post(`${base}/read`, {}),
				o: () =>
					current &&
					childAt.has(current.seq) &&
					setInline((prev) => {
						const next = new Set(prev)
						if (next.has(current.seq)) next.delete(current.seq)
						else next.add(current.seq)
						return next
					}),
				s: () => {
					const child = current && childAt.get(current.seq)
					if (child) navigate({ view: 'stream', handle: props.handle, seq: current.seq, side: child.handle })
				},
				x: () => props.side && navigate({ view: 'stream', handle: props.handle, seq: current?.seq }),
				p: () =>
					current?.type.endsWith('.decision') &&
					navigate({ view: 'provenance', handle: current.stream, seq: current.seq }),
				a: () => current && openAsk.has(current.seq) && setAction({ seq: current.seq, kind: 'answer' }),
				R: () => current?.type.endsWith('.decision') && setAction({ seq: current.seq, kind: 'ratify' }),
				O: () => current?.type.endsWith('.decision') && setAction({ seq: current.seq, kind: 'override' }),
				Escape: () => setAction(undefined),
			}),
			[info?.views, base, current, childAt, props.handle, props.side, openAsk],
		),
	)

	if (!info) return <Loading error={error} />
	const { stream } = info
	const me = info.members.find((m) => m.participant === 'council')
	return (
		<div className={props.side ? 'split' : 'with-side'}>
			<div className="view">
				<header className="stream-head">
					<div className="row">
						<TypeChip type={stream.type} />
						<h1>{stream.title}</h1>
						<span className={`pill state-${stream.state}`}>{stream.state}</span>
					</div>
					<div className="muted">
						<code>{stream.handle}</code>
						{stream.aliases.length ? ` (was ${stream.aliases.join(', ')})` : ''}
						{info.anchor ? (
							<>
								{' '}
								· branched from <RefText text={info.anchor} />
							</>
						) : null}
						{stream.conventions.length ? ` · conventions: ${stream.conventions.join(', ')}` : ''}
						{me ? ` · you read to #${me.cursor} of #${stream.stats.lastSeq}` : ''}
					</div>
					{stream.purpose ? <p>{stream.purpose}</p> : null}
					<Refs refs={stream.context} />
				</header>

				<div className="toolbar">
					{info.views.includes('distilled') ? (
						<span className="segmented">
							<button type="button" className={view ? '' : 'active'} onClick={() => setView('')}>
								raw
							</button>
							<button
								type="button"
								className={view === 'distilled' ? 'active' : ''}
								onClick={() => setView('distilled')}
							>
								distilled
							</button>
							<kbd>v</kbd>
						</span>
					) : null}
					<button type="button" className={threads ? 'active' : ''} onClick={() => setThreads((x) => !x)}>
						threads <kbd>t</kbd>
					</button>
					<button type="button" className={showMeta ? 'active' : ''} onClick={() => setShowMeta((x) => !x)}>
						meta <kbd>m</kbd>
					</button>
					<button type="button" onClick={() => void post(`${base}/read`, {})}>
						mark read <kbd>r</kbd>
					</button>
				</div>
				<div className="toolbar facets">
					{typeFacets.map((t) => (
						<TypeChip
							key={t}
							type={t}
							active={types.includes(t)}
							onClick={() => setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))}
						/>
					))}
					{tagFacets.map((t) => (
						<Tag
							key={t}
							tag={tag === t ? `${t} ✕` : t}
							onClick={() => setTag((prev) => (prev === t ? undefined : t))}
						/>
					))}
				</div>

				<div className="timeline">
					{shown.length === 0 ? <p className="empty">0 entries match</p> : null}
					{shown.map(({ entry, depth }, i) => {
						const child = childAt.get(entry.seq)
						const isDecision = entry.type.endsWith('.decision')
						const askKey = openAsk.get(entry.seq)
						return (
							<div key={entry.id} style={{ marginLeft: `${depth * 1.5}rem` }}>
								<EntryLine entry={entry} selected={i === index}>
									{child ? (
										<div className="anchor-box">
											⤷ child stream <TypeChip type={child.type} />{' '}
											<Link className="seq" to={{ view: 'stream', handle: child.handle }}>
												{child.handle}
											</Link>{' '}
											<span className={`pill state-${child.state}`}>{child.state}</span>
											<button
												type="button"
												className="inline"
												onClick={() =>
													setInline((prev) => {
														const next = new Set(prev)
														if (next.has(entry.seq)) next.delete(entry.seq)
														else next.add(entry.seq)
														return next
													})
												}
											>
												<kbd>o</kbd> {inline.has(entry.seq) ? 'collapse' : 'inline'}
											</button>
											<Link
												className="inline"
												to={{ view: 'stream', handle: props.handle, seq: entry.seq, side: child.handle }}
											>
												<kbd>s</kbd> side by side
											</Link>
											{inline.has(entry.seq) ? <Timeline handle={child.handle} compact /> : null}
										</div>
									) : null}
									{isDecision ? (
										<div className="row">
											<Link className="inline" to={{ view: 'provenance', handle: entry.stream, seq: entry.seq }}>
												<kbd>p</kbd> provenance
											</Link>
											<button
												type="button"
												className="inline"
												onClick={() => setAction({ seq: entry.seq, kind: 'ratify' })}
											>
												<kbd>R</kbd> ratify
											</button>
											<button
												type="button"
												className="inline"
												onClick={() => setAction({ seq: entry.seq, kind: 'override' })}
											>
												<kbd>O</kbd> override
											</button>
										</div>
									) : null}
									{askKey && action?.seq !== entry.seq ? (
										<button
											type="button"
											className="inline"
											onClick={() => setAction({ seq: entry.seq, kind: 'answer' })}
										>
											<kbd>a</kbd> answer as the Council
										</button>
									) : null}
									{action?.seq === entry.seq && action.kind === 'answer' && askKey ? (
										<AnswerBox stream={props.handle} stateKey={askKey} onDone={() => setAction(undefined)} />
									) : null}
									{action?.seq === entry.seq && action.kind !== 'answer' ? (
										<RulingBox entry={entry} ruling={action.kind} onDone={() => setAction(undefined)} />
									) : null}
								</EntryLine>
							</div>
						)
					})}
				</div>
			</div>
			{props.side ? (
				<div className="view side-stream">
					<div className="row">
						<h2 className="grow">
							<Link to={{ view: 'stream', handle: props.side }}>{props.side}</Link>
						</h2>
						<Link className="inline" to={{ view: 'stream', handle: props.handle, seq: props.seq }}>
							<kbd>x</kbd> close
						</Link>
					</div>
					<Timeline handle={props.side} />
				</div>
			) : (
				<Sidebar info={info} />
			)}
		</div>
	)
}
