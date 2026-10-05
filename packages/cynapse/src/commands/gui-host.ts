// What `cynapse gui` needs from outside the process: the GUI package, a browser, and a
// signal to stop on. Kept apart from the command so its tests can stand in for each.
import { spawn } from 'node:child_process'
import type { Store } from '../store/types.js'

export const GUI_PACKAGE = '@cyberuni/cynapse-gui'

/** The contract `@cyberuni/cynapse-gui` exports. */
export interface GuiModule {
	start(options: { store: Store; port?: number }): Promise<{ url: string; close(): Promise<void> }>
}

/**
 * The GUI is an optional package, loaded only when asked for. The specifier is a
 * variable so neither TypeScript nor the CLI bundle tries to resolve it at build time.
 */
export function loadGui(): Promise<GuiModule> {
	const specifier: string = GUI_PACKAGE
	return import(specifier) as Promise<GuiModule>
}

/** Best effort: a machine with no browser opener still gets the URL printed. */
export function openBrowser(url: string): void {
	const [command, args] =
		process.platform === 'darwin'
			? ['open', [url]]
			: process.platform === 'win32'
				? ['cmd', ['/c', 'start', '""', url]]
				: ['xdg-open', [url]]
	const child = spawn(command, args, { detached: true, stdio: 'ignore' })
	child.on('error', () => {})
	child.unref()
}

/** Runs `stop` once on Ctrl-C or a termination signal. */
export function onStop(stop: () => Promise<void>): void {
	let stopping = false
	const handler = () => {
		if (stopping) return
		stopping = true
		void stop()
	}
	process.once('SIGINT', handler)
	process.once('SIGTERM', handler)
}
