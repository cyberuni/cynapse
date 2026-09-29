// Production server: the built UI from `dist/` plus the API, on one port.
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { createApi } from './api.ts'
import { openCortexStore } from './store.ts'

const { store, label } = openCortexStore()
const app = new Hono()
app.route('/', createApi(store))
app.use('/*', serveStatic({ root: './dist' }))
app.get('/*', serveStatic({ path: './dist/index.html' }))

const port = Number(process.env.PORT ?? 4173)
serve({ fetch: app.fetch, port }, () => console.info(`Cortex on http://localhost:${port} (${label})`))
