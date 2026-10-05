// Keyboard bindings, including two-key chords such as `g t`, in the spirit of a TUI.

export function createKeymap(bindings: string[], options: { timeout?: number; now?: () => number } = {}) {
	const timeout = options.timeout ?? 1000
	const now = options.now ?? Date.now
	const known = new Set(bindings)
	const prefixes = new Set(bindings.filter((b) => b.includes(' ')).map((b) => b.split(' ')[0]))
	let pending: { key: string; at: number } | undefined

	return {
		/** Returns the binding a key completes, or undefined while a chord is pending or nothing matched. */
		press(key: string): string | undefined {
			if (pending && now() - pending.at <= timeout) {
				const chord = `${pending.key} ${key}`
				pending = undefined
				return known.has(chord) ? chord : undefined
			}
			pending = undefined
			if (prefixes.has(key)) {
				pending = { key, at: now() }
				return undefined
			}
			return known.has(key) ? key : undefined
		},
	}
}
