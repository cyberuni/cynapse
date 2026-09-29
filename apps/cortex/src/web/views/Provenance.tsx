import { useCallback, useMemo } from 'react'
import type { Entry } from '../../core/model.ts'
import type { Provenance as ProvenanceData } from '../../core/provenance.ts'
import { Empty, EntryLine, Link, Loading, TypeChip } from '../components.tsx'
import { navigate, useApi, useListNav } from '../data.ts'

export function Provenance(props: { handle: string; seq: number }) {
	const { data, error } = useApi<ProvenanceData>(`/api/provenance/${encodeURIComponent(props.handle)}/${props.seq}`)
	const flat: Entry[] = useMemo(
		() =>
			data
				? [
						data.decision,
						...(data.anchor ? [data.anchor] : []),
						...data.transcript,
						...data.contributions,
						...data.replies,
					]
				: [],
		[data],
	)
	const open = useCallback(
		(i: number) => flat[i] && navigate({ view: 'stream', handle: flat[i].stream, seq: flat[i].seq }),
		[flat],
	)
	const [index] = useListNav(flat.length, open)
	const sel = flat[index]?.id

	if (!data) return <Loading error={error} />
	const step = (n: number, title: string, children: React.ReactNode) => (
		<section className="prov-step">
			<div className="prov-num">{n}</div>
			<div className="grow">
				<h2>{title}</h2>
				{children}
			</div>
		</section>
	)
	return (
		<div className="view">
			<h1>
				Provenance <span className="muted">— {`${data.decision.stream}#${data.decision.seq}`}</span>
			</h1>
			{step(
				1,
				'Decision',
				<EntryLine entry={data.decision} selected={sel === data.decision.id} showStream idRefs={data.idRefs} />,
			)}
			{step(
				2,
				'Asked by',
				data.anchor ? (
					<EntryLine entry={data.anchor} selected={sel === data.anchor.id} showStream idRefs={data.idRefs} />
				) : (
					<Empty what="anchor entries — the decision replies to nothing" />
				),
			)}
			{step(
				3,
				'Arbitration transcript',
				data.arbitration ? (
					<>
						<p className="muted">
							<TypeChip type={data.arbitration.type} />{' '}
							<Link className="seq" to={{ view: 'stream', handle: data.arbitration.handle }}>
								{data.arbitration.handle}
							</Link>{' '}
							— electorate {data.arbitration.members.map((m) => m.participant).join(', ')}
						</p>
						{data.transcript.map((e) => (
							<EntryLine key={e.id} entry={e} selected={sel === e.id} showStream idRefs={data.idRefs} />
						))}
					</>
				) : (
					<Empty what="arbitration streams — decided without one" />
				),
			)}
			{step(
				4,
				'Contributions behind it',
				data.contributions.length ? (
					data.contributions.map((e) => <EntryLine key={e.id} entry={e} selected={sel === e.id} showStream />)
				) : (
					<Empty what="referenced contributions" />
				),
			)}
			{step(
				5,
				'Rulings and replies',
				data.replies.length ? (
					data.replies.map((e) => <EntryLine key={e.id} entry={e} selected={sel === e.id} showStream />)
				) : (
					<Empty what="replies — not yet ratified or overridden" />
				),
			)}
		</div>
	)
}
