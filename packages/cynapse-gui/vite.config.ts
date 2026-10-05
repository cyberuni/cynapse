import { getRequestListener } from '@hono/node-server'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { createApi } from './src/server/api.ts'
import { openGuiStore } from './src/server/store.ts'

// Mounts the API inside Vite's dev server, so `pnpm gui dev` is one process. The
// store opens on the first API request, so a missing database is reported there
// rather than stopping Vite (or Vitest, which also runs this hook).
function guiApi(): Plugin {
	return {
		name: 'cynapse-gui-api',
		configureServer(server) {
			let listener: ReturnType<typeof getRequestListener> | undefined
			server.middlewares.use((req, res, next) => {
				if (!req.url?.startsWith('/api/')) return next()
				try {
					if (!listener) {
						const { store, label } = openGuiStore()
						server.config.logger.info(`  cynapse gui store: ${label}`)
						listener = getRequestListener(createApi(store, { port: server.config.server.port }).fetch)
					}
					void listener(req, res)
				} catch (err) {
					res.statusCode = 503
					res.setHeader('content-type', 'application/json')
					res.end(JSON.stringify({ error: (err as Error).message }))
				}
			})
		},
	}
}

export default defineConfig({
	plugins: [react(), guiApi()],
	// Loopback only, on a fixed port the API's host guard can check.
	server: { host: '127.0.0.1', port: 5173, strictPort: true },
	// tsdown writes the server to `dist/` first; the UI goes beside it, where `start()` finds it.
	build: { outDir: 'dist/web', emptyOutDir: true },
})
