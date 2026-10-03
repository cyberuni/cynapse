import { useCallback, useState } from 'react'
import type { Entry } from '../../core/model.ts'
import { Empty, EntryLine, Loading, Tag, TypeChip } from '../components.tsx'
import { navigate, useApi, useListNav } from '../data.ts'

function parseQuery(text: string) {
	const words = text.split(/\s+/).filter(Boolean)
	return {
		types: words.filter((w) => w.startsWith('type:')).map((w) => w.slice(5)),
		tags: words.filter((w) => !w.startsWith('type:')).map((w) => w.replace(/^#/, '')),
	}
}

export function Search(props: { types: string[]; tags: string[] }) {
	const initial = [...props.types.map((t) => `type:${t}`), ...props.tags].join(' ')
	const [text, setText] = useState(initial)
	const { data: facets } = useApi<{ types: string[]; tags: string[] }>('/api/facets')
	const query = new URLSearchParams()
	if (props.types.length) query.set('types', props.types.join(','))
	if (props.tags.length) query.set('tags', props.tags.join(','))
	const active = props.types.length + props.tags.length > 0
	const { data, error } = useApi<Entry[]>(active ? `/api/search?${query}` : undefined)
	const results = data ?? []
	const open = useCallback(
		(i: number) => results[i] && navigate({ view: 'channel', handle: results[i].channel, seq: results[i].seq }),
		[results],
	)
	const [index] = useListNav(results.length, open)

	const submit = (next: { types: string[]; tags: string[] }) => navigate({ view: 'search', ...next })
	const toggle = (kind: 'types' | 'tags', value: string) => {
		const cur = props[kind]
		submit({ ...props, [kind]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] })
	}

	return (
		<div className="view">
			<h1>
				Search <span className="muted">— across every channel, by type and tag</span>
			</h1>
			<form
				onSubmit={(e) => {
					e.preventDefault()
					submit(parseQuery(text))
					;(document.activeElement as HTMLElement | null)?.blur()
				}}
			>
				<input
					id="search-input"
					className="search"
					value={text}
					placeholder="type:truss.decision topic:auth — Enter to search, Esc to leave the box"
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
				/>
			</form>
			{facets ? (
				<div className="toolbar facets">
					{facets.types
						.filter((t) => !t.startsWith('cynapse.'))
						.map((t) => (
							<TypeChip key={t} type={t} active={props.types.includes(t)} onClick={() => toggle('types', t)} />
						))}
				</div>
			) : null}
			{facets ? (
				<div className="toolbar facets">
					{facets.tags.map((t) => (
						<Tag key={t} tag={props.tags.includes(t) ? `${t} ✕` : t} onClick={() => toggle('tags', t)} />
					))}
				</div>
			) : null}
			{!active ? (
				<p className="muted">
					Pick a type or tag, or try <code>type:truss.decision type:sdd.decision</code>.
				</p>
			) : !data ? (
				<Loading error={error} />
			) : (
				<>
					<p className="muted">{results.length} entries</p>
					{results.length === 0 ? <Empty what="entries match" /> : null}
					{results.map((e, i) => (
						<EntryLine key={e.id} entry={e} selected={i === index} showChannel />
					))}
				</>
			)}
		</div>
	)
}
