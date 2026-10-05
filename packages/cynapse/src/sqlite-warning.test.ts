import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { silenceSqliteWarning } from './sqlite-warning.js'

describe(silenceSqliteWarning.name, () => {
	const original = process.emitWarning
	const seen: string[] = []
	const record = (warning: Error) => seen.push(warning.message)

	beforeEach(() => {
		seen.length = 0
		process.on('warning', record)
		silenceSqliteWarning()
	})

	afterEach(() => {
		process.emitWarning = original
		process.off('warning', record)
	})

	// Warnings reach 'warning' listeners on the next tick.
	const flush = () => new Promise((resolve) => setImmediate(resolve))

	it('drops the node:sqlite experimental warning, as a string or an Error', async () => {
		const text = 'SQLite is an experimental feature and might change at any time'
		process.emitWarning(text, 'ExperimentalWarning')
		process.emitWarning(Object.assign(new Error(text), { name: 'ExperimentalWarning' }))
		await flush()
		expect(seen).toEqual([])
	})

	it('passes every other warning through', async () => {
		process.emitWarning('VM Modules is an experimental feature', 'ExperimentalWarning')
		process.emitWarning('something is deprecated', 'DeprecationWarning')
		process.emitWarning(new Error('a plain warning'))
		await flush()
		expect(seen).toEqual(['VM Modules is an experimental feature', 'something is deprecated', 'a plain warning'])
	})
})
