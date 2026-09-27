import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readPackageVersion } from './version.js'

describe(readPackageVersion.name, () => {
	it('reads the version the package.json actually carries', () => {
		const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
		expect(readPackageVersion()).toBe(version)
	})
})
