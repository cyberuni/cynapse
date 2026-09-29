// Cortex's HTTP API: JSON over a cynapse store. The UI uses it, and so can an agent —
// every view the Council sees is one `curl` away ("robot mode").
import { Hono } from 'hono'
import { ActionError, answer, ruleOnDecision } from '../core/actions.ts'
import { foldGraph } from '../core/graph.ts'
import { hierarchy } from '../core/hierarchy.ts'
import { members, waits } from '../core/members.ts'
import { COUNCIL, type Store } from '../core/model.ts'
import { provenance } from '../core/provenance.ts'
import { triage } from '../core/triage.ts'

const list = (value: string | undefined) => (value ? value.split(',').filter(Boolean) : undefined)

export function createApi(store: Store, participant = COUNCIL) {
	const app = new Hono().basePath('/api')

	app.onError((err, c) => {
		if (err instanceof ActionError || err instanceof SyntaxError) return c.json({ error: err.message }, 400)
		throw err
	})

	app.get('/triage', (c) => c.json(triage(store, participant)))
	app.get('/tree', (c) => c.json(hierarchy(store, participant)))
	app.get('/waits', (c) => c.json(waits(store)))

	app.get('/streams/:handle', (c) => {
		const stream = store.getStream(c.req.param('handle'))
		if (!stream) return c.json({ error: `unknown stream: ${c.req.param('handle')}` }, 404)
		const parent = stream.parent && store.getStream(stream.parent.streamId)
		return c.json({
			stream,
			anchor: parent && stream.parent ? `${parent.handle}#${stream.parent.seq}` : undefined,
			members: members(store, stream.id),
			waits: waits(store, stream.id),
			children: store.children(stream.id).map((s) => ({
				handle: s.handle,
				title: s.title,
				type: s.type,
				state: s.state,
				anchorSeq: s.parent?.seq,
			})),
			pinned: stream.pinned.flatMap((seq) => store.entry(`${stream.handle}#${seq}`) ?? []),
			views: store.views(stream.id).map((v) => v.name),
			states: store.states({ stream: stream.id }),
		})
	})

	app.get('/streams/:handle/entries', (c) => {
		const handle = c.req.param('handle')
		if (!store.getStream(handle)) return c.json({ error: `unknown stream: ${handle}` }, 404)
		return c.json(
			store.entries(handle, {
				view: c.req.query('view') || undefined,
				types: list(c.req.query('types')),
				tags: list(c.req.query('tags')),
			}),
		)
	})

	app.get('/search', (c) =>
		c.json(
			store.search({
				types: list(c.req.query('types')),
				tags: list(c.req.query('tags')),
				streams: list(c.req.query('streams')),
			}),
		),
	)

	app.get('/facets', (c) => {
		const entries = store.search({})
		return c.json({
			types: [...new Set(entries.map((e) => e.type))].sort(),
			tags: [...new Set(entries.flatMap((e) => e.tags))].sort(),
		})
	})

	app.get('/provenance/:handle/:seq', (c) => {
		const trail = provenance(store, `${c.req.param('handle')}#${c.req.param('seq')}`)
		return trail ? c.json(trail) : c.json({ error: 'unknown entry' }, 404)
	})

	app.get('/graph/:handle', (c) => {
		const handle = c.req.param('handle')
		if (!store.getStream(handle)) return c.json({ error: `unknown stream: ${handle}` }, 404)
		const at = c.req.query('at')
		return c.json(foldGraph(store.entries(handle), at ? Number(at) : undefined))
	})

	app.post('/streams/:handle/read', async (c) => {
		const body = await c.req.json<{ seq?: number }>().catch(() => ({}) as { seq?: number })
		store.markRead(c.req.param('handle'), participant, body.seq)
		return c.json({ ok: true })
	})

	app.post('/answer', async (c) => {
		const body = await c.req.json<{ stream: string; key: string; body: string }>()
		return c.json(answer(store, body))
	})

	app.post('/rule', async (c) => {
		const body = await c.req.json<{ ref: string; ruling: 'ratify' | 'override'; body?: string }>()
		return c.json(ruleOnDecision(store, body))
	})

	return app
}
