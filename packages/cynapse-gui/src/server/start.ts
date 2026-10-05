// Starts the GUI: the built UI plus the API, on one loopback port. `cynapse gui` calls
// this with the store it opened; `pnpm gui start` calls it from `main.ts`.
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { createAdaptorServer } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import type { Store } from '../core/model.ts'
import { createApi } from './api.ts'

export interface StartOptions {
	store: Store
	/** Default 4173. The API's host guard accepts only this port. */
	port?: number
	/** The built UI. Default: `web/` beside the bundled module, where the build puts it. */
	webRoot?: string
}

export interface Gui {
	url: string
	close(): Promise<void>
}

// Loopback only: the GUI acts as the Council and must not be reachable from the network.
const HOSTNAME = '127.0.0.1'

export async function start({ store, port = 4173, webRoot = defaultWebRoot() }: StartOptions): Promise<Gui> {
	const app = new Hono()
	app.route('/', createApi(store, { port }))
	app.use('/*', serveStatic({ root: webRoot }))
	app.get('/*', serveStatic({ root: webRoot, path: 'index.html' }))

	const server = createAdaptorServer({ fetch: app.fetch })
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject)
		server.listen(port, HOSTNAME, () => {
			server.off('error', reject)
			resolve()
		})
	})
	const { port: bound } = server.address() as AddressInfo
	return {
		url: `http://${HOSTNAME}:${bound}`,
		close: () =>
			new Promise<void>((resolve, reject) => {
				server.close((err) => (err ? reject(err) : resolve()))
				// Browsers hold keep-alive sockets open; without this, close waits on them.
				if ('closeAllConnections' in server) server.closeAllConnections()
			}),
	}
}

function defaultWebRoot(): string {
	return fileURLToPath(new URL('./web/', import.meta.url))
}
