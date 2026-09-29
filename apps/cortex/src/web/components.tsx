import type { MouseEvent, ReactNode } from 'react'
import type { Entry } from '../core/model.ts'
import { linkRef, splitRefs } from '../core/refs.ts'
import { navigate } from './data.ts'
import { type Route, routeHref } from './route.ts'

export function Link(props: { to: Route | string; children: ReactNode; className?: string; title?: string }) {
	const href = typeof props.to === 'string' ? props.to : routeHref(props.to)
	const onClick = (event: MouseEvent) => {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
		event.preventDefault()
		navigate(href)
	}
	return (
		<a href={href} onClick={onClick} className={props.className} title={props.title}>
			{props.children}
		</a>
	)
}

function RefAnchor({ text }: { text: string }) {
	const link = linkRef(text)
	if (!link.href) return <span className="ref">{text}</span>
	if (link.external)
		return (
			<a className="ref ext" href={link.href} target="_blank" rel="noreferrer">
				{text}
			</a>
		)
	return (
		<Link className="ref" to={link.href}>
			{text}
		</Link>
	)
}

/** Prose with every reference shorthand rendered as a link. */
export function RefText({ text }: { text: string }) {
	return (
		<>
			{splitRefs(text).map((part, i) =>
				typeof part === 'string' ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and static
					<span key={i}>{part}</span>
				) : (
					// biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and static
					<RefAnchor key={i} text={part.text} />
				),
			)}
		</>
	)
}

export function Refs({ refs }: { refs: string[] }) {
	if (!refs.length) return null
	return (
		<span className="refs">
			{refs.map((r) => (
				<RefAnchor key={r} text={r} />
			))}
		</span>
	)
}

/** A type chip, colored by the type's family. */
export function TypeChip({ type, onClick, active }: { type: string; onClick?: () => void; active?: boolean }) {
	const family = type.startsWith('cynapse.')
		? 'meta'
		: /decision|ratify|override|consensus/.test(type)
			? 'decision'
			: /escalation|needs-input|arbitration-needed|gate/.test(type)
				? 'alert'
				: /answer/.test(type)
					? 'answer'
					: 'plain'
	const className = `chip chip-${family}${active ? ' active' : ''}`
	return onClick ? (
		<button type="button" className={className} onClick={onClick}>
			{type}
		</button>
	) : (
		<span className={className}>{type}</span>
	)
}

export function Tag({ tag, onClick }: { tag: string; onClick?: () => void }) {
	return onClick ? (
		<button type="button" className="tag" onClick={onClick}>
			#{tag}
		</button>
	) : (
		<span className="tag">#{tag}</span>
	)
}

export function time(iso: string) {
	return new Date(iso).toISOString().slice(5, 16).replace('T', ' ')
}

/** One entry: header line, body with linked refs, and its tags. */
export function EntryLine(props: {
	entry: Entry
	selected?: boolean
	showStream?: boolean
	/** Entry ids in the payload to render as `handle#seq` links. */
	idRefs?: Record<string, string>
	children?: ReactNode
}) {
	const { entry } = props
	return (
		<div className="entry" data-selected={props.selected} id={`e-${entry.stream}-${entry.seq}`}>
			<div className="entry-head">
				<Link className="seq" to={{ view: 'stream', handle: entry.stream, seq: entry.seq }}>
					{props.showStream ? `${entry.stream}#${entry.seq}` : `#${entry.seq}`}
				</Link>
				<span className="author">{entry.author}</span>
				<TypeChip type={entry.type} />
				{entry.parentSeq ? <span className="muted">↳ #{entry.parentSeq}</span> : null}
				<span className="muted grow">{time(entry.createdAt)}</span>
				{entry.tags.map((t) => (
					<Tag key={t} tag={t} />
				))}
			</div>
			{entry.body ? (
				<div className="entry-body">
					<RefText text={entry.body} />
				</div>
			) : null}
			<Refs refs={entry.refs} />
			{entry.data && !entry.type.startsWith('cynapse.') ? <DataLine data={entry.data} idRefs={props.idRefs} /> : null}
			{props.children}
		</div>
	)
}

/**
 * A typed payload's scalar fields, compact. Nested objects are left to the raw JSON
 * tooltip. An entry id found in `idRefs` renders as its `handle#seq` link.
 */
function DataLine({ data, idRefs = {} }: { data: Record<string, unknown>; idRefs?: Record<string, string> }) {
	const fields = Object.entries(data).flatMap(([key, value]): [string, string[]][] => {
		if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
			return [[key, [String(value)]]]
		if (Array.isArray(value) && value.every((v) => typeof v !== 'object')) return [[key, value.map(String)]]
		return []
	})
	if (!fields.length) return null
	return (
		<div className="data" title={JSON.stringify(data, null, 2)}>
			{fields.map(([key, values]) => (
				<span key={key}>
					<span className="muted">{key}</span>{' '}
					{values.map((v, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: values are positional and static
						<span key={i}>
							{i > 0 ? ', ' : null}
							{idRefs[v] ? <RefText text={idRefs[v]} /> : v}
						</span>
					))}
				</span>
			))}
		</div>
	)
}

export function Empty({ what }: { what: string }) {
	return <p className="empty">0 {what}</p>
}

export function Loading({ error }: { error?: string }) {
	return error ? <p className="error">{error}</p> : <p className="muted">loading…</p>
}
