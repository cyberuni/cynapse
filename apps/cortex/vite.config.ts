import { getRequestListener } from '@hono/node-server'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { createApi } from './src/server/api.ts'
import { openCortexStore } from './src/server/store.ts'

// Mounts the API inside Vite's dev server, so `pnpm cortex dev` is one process.
function cortexApi(): Plugin {
	return {
		name: 'cortex-api',
		configureServer(server) {
			const { store, label } = openCortexStore()
			const listener = getRequestListener(createApi(store).fetch)
			server.config.logger.info(`  Cortex store: ${label}`)
			server.middlewares.use((req, res, next) => {
				if (req.url?.startsWith('/api/')) void listener(req, res)
				else next()
			})
		},
	}
}

export default defineConfig({
	plugins: [react(), cortexApi()],
	server: { port: 5173 },
})
