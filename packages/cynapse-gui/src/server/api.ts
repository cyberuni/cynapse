// The GUI's HTTP API: JSON over a cynapse store. The UI uses it, and so can an agent —
// every view the Council sees is one `curl` away ("robot mode").
import { Hono } from 'hono'
import { ActionError, answer, ruleOnDecision, rulings } from '../core/actions.ts'
import { foldGraph } from '../core/graph.ts'
import { hierarchy } from '../core/hierarchy.ts'
import { members, waits } from '../core/members.ts'
import { COUNCIL, type Store } from '../core/model.ts'
import { payloadIdRefs, provenance } from '../core/provenance.ts'
import { triage } from '../core/triage.ts'
import { localOnly } from './guard.ts'

const list = (value: string | undefined) => (value ? value.split(',').filter(Boolean) : undefined)

export function createApi(store: Store, options: { participant?: string; port?: number } = {}) {
	const participant = options.participant ?? COUNCIL
	const app = new Hono().basePath('/api')
	app.use('*', localOnly({ port: options.port }))

	app.onError((err, c) => {
		if (err instanceof ActionError && err.code) return c.json({ error: err.message, code: err.code }, 409)
		if (err instanceof ActionError || err instanceof SyntaxError) return c.json({ error: err.message }, 400)
		throw err
	})

	app.get('/triage', (c) => c.json(triage(store, participant)))
	app.get('/tree', (c) => c.json(hierarchy(store, participant)))
	app.get('/waits', (c) => c.json(waits(store)))

	app.get('/channels', (c) => c.json(store.listChannels({ type: c.req.query('type') || undefined })))

	app.get('/channels/:handle', (c) => {
		const channel = store.getChannel(c.req.param('handle'))
		if (!channel) return c.json({ error: `unknown channel: ${c.req.param('handle')}` }, 404)
		const parent = channel.parent && store.getChannel(channel.parent.channelId)
		return c.json({
			channel,
			anchor: parent && channel.parent ? `${parent.handle}#${channel.parent.seq}` : undefined,
			members: members(store, channel.id),
			waits: waits(store, channel.id),
			children: store.children(channel.id).map((s) => ({
				handle: s.handle,
				title: s.title,
				type: s.type,
				state: s.state,
				anchorSeq: s.parent?.seq,
			})),
			pinned: channel.pinned.flatMap((seq) => store.entry(`${channel.handle}#${seq}`) ?? []),
			views: store.views(channel.id).map((v) => v.name),
			states: store.states({ channel: channel.id }),
			rulings: rulings(store, channel.id),
			idRefs: payloadIdRefs(store, store.entries(channel.id)),
		})
	})

	app.get('/channels/:handle/entries', (c) => {
		const handle = c.req.param('handle')
		if (!store.getChannel(handle)) return c.json({ error: `unknown channel: ${handle}` }, 404)
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
				channels: list(c.req.query('channels')),
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
		if (!store.getChannel(handle)) return c.json({ error: `unknown channel: ${handle}` }, 404)
		const at = c.req.query('at')
		return c.json(foldGraph(store.entries(handle), at ? Number(at) : undefined))
	})

	app.post('/channels/:handle/read', async (c) => {
		const body = await c.req.json<{ seq?: number }>().catch(() => ({}) as { seq?: number })
		store.markRead(c.req.param('handle'), participant, body.seq)
		return c.json({ ok: true })
	})

	app.post('/answer', async (c) => {
		const body = await c.req.json<{ channel: string; key: string; body: string }>()
		return c.json(answer(store, body))
	})

	app.post('/rule', async (c) => {
		const body = await c.req.json<{ ref: string; ruling: 'ratify' | 'override'; body?: string }>()
		return c.json(ruleOnDecision(store, body))
	})

	return app
}
