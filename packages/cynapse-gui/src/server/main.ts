// `pnpm gui start`: the built UI and the API from this checkout, without the cynapse CLI.
import { fileURLToPath } from 'node:url'
import { start } from './start.ts'
import { openGuiStore } from './store.ts'

const { store, label } = openGuiStore()
const gui = await start({
	store,
	port: Number(process.env.PORT ?? 4173),
	webRoot: fileURLToPath(new URL('../../dist/web/', import.meta.url)),
})
console.info(`cynapse gui on ${gui.url} (${label})`)
