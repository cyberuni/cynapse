// node:sqlite prints an ExperimentalWarning when first loaded (Node 22; Node 24.21 no
// longer does). Agents read stderr, so that line would look like a failure. This module
// is its own entry and imports nothing, so a caller can install the filter before it
// loads anything that loads node:sqlite — the package index does.

/** Drop node:sqlite's experimental warning and pass every other warning through. */
export function silenceSqliteWarning(): void {
	const emitWarning = process.emitWarning.bind(process)
	process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
		const text = typeof warning === 'string' ? warning : warning.message
		if (text.includes('SQLite is an experimental feature')) return
		return (emitWarning as (...args: unknown[]) => void)(warning, ...rest)
	}) as typeof process.emitWarning
}
