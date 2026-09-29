import { useCallback, useMemo, useState } from 'react'
import type { Triage as TriageData } from '../../core/triage.ts'
import { Empty, Link, Loading, RefText, TypeChip, time } from '../components.tsx'
import { navigate, post, useApi, useKeys, useListNav } from '../data.ts'
import type { Route } from '../route.ts'

type Item = { key: string; route: Route }

export function AnswerBox(props: { stream: string; stateKey: string; onDone: () => void }) {
	const [body, setBody] = useState('')
	const [error, setError] = useState<string>()
	const submit = async () => {
		try {
			await post('/api/answer', { stream: props.stream, key: props.stateKey, body })
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
				placeholder="Answer as the Council… (Ctrl+Enter to send, Esc to cancel)"
				onChange={(e) => setBody(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === 'Escape') props.onDone()
					if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submit()
				}}
			/>
			<div className="row">
				<button type="submit" disabled={!body.trim()}>
					Send answer
				</button>
				<button type="button" onClick={props.onDone}>
					Cancel
				</button>
				{error ? <span className="error">{error}</span> : null}
			</div>
		</form>
	)
}

export function Triage() {
	const { data, error } = useApi<TriageData>('/api/triage')
	const [answering, setAnswering] = useState<string>()
	const items: Item[] = useMemo(
		() =>
			data
				? [
						...data.needsInput.map((n) => ({
							key: `n:${n.handle}:${n.key}`,
							route: { view: 'stream', handle: n.handle, seq: n.seq } as Route,
						})),
						...data.arbitrations.map((a) => ({
							key: `a:${a.handle}`,
							route: { view: 'stream', handle: a.handle } as Route,
						})),
						...data.unread.map((u) => ({ key: `u:${u.handle}`, route: { view: 'stream', handle: u.handle } as Route })),
					]
				: [],
		[data],
	)
	const open = useCallback((i: number) => items[i] && navigate(items[i].route), [items])
	const [index] = useListNav(items.length, open)
	const selected = items[index]?.key
	useKeys(
		useMemo(
			() => ({
				a: () => selected?.startsWith('n:') && setAnswering(selected),
			}),
			[selected],
		),
	)

	if (!data) return <Loading error={error} />
	const total = data.needsInput.length + data.arbitrations.length
	return (
		<div className="view">
			<h1>
				Triage <span className="muted">— {total ? `${total} need your hands` : 'nothing needs your hands'}</span>
			</h1>

			<section>
				<h2>Needs your input</h2>
				{data.needsInput.length === 0 ? <Empty what="needs-input for the Council" /> : null}
				{data.needsInput.map((n) => {
					const key = `n:${n.handle}:${n.key}`
					return (
						<div key={key} className="card alert" data-selected={selected === key}>
							<div className="entry-head">
								<Link className="seq" to={{ view: 'stream', handle: n.handle, seq: n.seq }}>
									{n.handle}#{n.seq}
								</Link>
								<span className="author">{n.author}</span>
								<TypeChip type={n.type} />
								<span className="muted grow">{time(n.createdAt)}</span>
								<span className="muted">{n.title}</span>
							</div>
							<div className="entry-body">
								<RefText text={n.body} />
							</div>
							{answering === key ? (
								<AnswerBox stream={n.handle} stateKey={n.key} onDone={() => setAnswering(undefined)} />
							) : (
								<button type="button" className="inline" onClick={() => setAnswering(key)}>
									<kbd>a</kbd> answer
								</button>
							)}
						</div>
					)
				})}
			</section>

			<section>
				<h2>Pending arbitrations</h2>
				{data.arbitrations.length === 0 ? <Empty what="pending arbitrations" /> : null}
				{data.arbitrations.map((a) => (
					<div key={a.handle} className="card" data-selected={selected === `a:${a.handle}`}>
						<div className="entry-head">
							<Link className="seq" to={{ view: 'stream', handle: a.handle }}>
								{a.handle}
							</Link>
							<span className="grow">{a.title}</span>
							{a.anchor ? (
								<span className="muted">
									anchored at <RefText text={a.anchor} />
								</span>
							) : null}
						</div>
						<div className="entry-body">
							waiting on{' '}
							{a.waiting.length ? (
								a.waiting.map((w) => (
									<span key={w} className="pill warn">
										{w}
									</span>
								))
							) : (
								<span className="muted">nobody</span>
							)}
						</div>
					</div>
				))}
			</section>

			<section>
				<h2>Unread</h2>
				{data.unread.length === 0 ? <Empty what="unread streams" /> : null}
				<div className="table">
					{data.unread.map((u) => (
						<div key={u.handle} className="tr" data-selected={selected === `u:${u.handle}`}>
							<Link className="seq" to={{ view: 'stream', handle: u.handle }}>
								{u.handle}
							</Link>
							<span className="grow">{u.title}</span>
							<TypeChip type={u.type} />
							<span className="count">{u.count}</span>
						</div>
					))}
				</div>
			</section>
		</div>
	)
}
