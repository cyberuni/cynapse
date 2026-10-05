import type { Command } from 'commander'
import { CynapseError } from '../cli-error.js'
import { output } from '../output.js'
import { openCommandStore, parseInteger } from './context.js'
import { GUI_PACKAGE, type GuiModule, loadGui, onStop, openBrowser } from './gui-host.js'

export function registerGui(program: Command): void {
	program
		.command('gui')
		.description(`open the Council's web viewer on this database (needs ${GUI_PACKAGE})`)
		.option('--port <n>', 'loopback port to serve on', '4173')
		.option('--no-open', 'print the URL without opening a browser')
		.action(async (opts: { port: string; open: boolean }, command: Command) => {
			const port = parseInteger(opts.port, '--port')
			const { start } = await load()
			const store = openCommandStore(command)
			let gui: Awaited<ReturnType<GuiModule['start']>>
			try {
				gui = await start({ store, port })
			} catch (error) {
				store.close()
				if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
					throw new CynapseError(`port ${port} is in use; pass --port <n> to pick another`, {
						code: 'port_in_use',
						cause: error,
					})
				}
				throw error
			}
			output({ url: gui.url }, () => `cynapse gui on ${gui.url} (Ctrl-C to stop)`)
			if (opts.open) openBrowser(gui.url)
			// The server keeps the process alive; the store stays open until it stops.
			onStop(async () => {
				await gui.close()
				store.close()
			})
		})
}

async function load(): Promise<GuiModule> {
	try {
		return await loadGui()
	} catch (error) {
		const err = error as NodeJS.ErrnoException
		if (err.code === 'ERR_MODULE_NOT_FOUND' && err.message.includes(GUI_PACKAGE)) {
			throw new CynapseError(
				`cynapse gui needs ${GUI_PACKAGE}; install it next to cynapse: npm install -g ${GUI_PACKAGE}`,
				{ code: 'gui_not_installed' },
			)
		}
		throw error
	}
}
