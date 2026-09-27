import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Read at runtime rather than imported, so the bundler never inlines a version that
 * `pnpm version` later bumps. Both `dist/cli.js` and `src/cli.ts` sit exactly one
 * directory below the package root, so the same relative path serves built and source.
 */
export function readPackageVersion(from: string = import.meta.url): string {
	const packageJson = join(dirname(fileURLToPath(from)), '..', 'package.json')
	const { version } = JSON.parse(readFileSync(packageJson, 'utf8')) as { version?: string }
	if (!version) throw new Error(`no version field in ${packageJson}`)
	return version
}
