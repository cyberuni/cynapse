// Production server: the built UI from `dist/` plus the API, on one loopback port.
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { createApi } from './api.ts'
import { openCortexStore } from './store.ts'

const port = Number(process.env.PORT ?? 4173)
const hostname = '127.0.0.1'
const { store, label } = openCortexStore()
const app = new Hono()
app.route('/', createApi(store, { port }))
app.use('/*', serveStatic({ root: './dist' }))
app.get('/*', serveStatic({ path: './dist/index.html' }))

// Loopback only: Cortex acts as the Council and must not be reachable from the network.
serve({ fetch: app.fetch, port, hostname }, () => console.info(`Cortex on http://${hostname}:${port} (${label})`))
