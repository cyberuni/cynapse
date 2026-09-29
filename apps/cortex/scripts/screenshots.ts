// Captures the PR screenshots from a running Cortex: `pnpm cortex screenshots [base-url]`.
// Uses the system Chrome, so no Playwright browser download is needed.
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'http://localhost:5173'
const out = new URL('../screenshots/', import.meta.url).pathname
const shots: [name: string, path: string, keys?: string[]][] = [
	['triage', '/'],
	['hierarchy', '/tree'],
	['stream-timeline', '/s/truss-auth#6', ['o']],
	['stream-distilled', '/s/m-login'],
	['stream-side-by-side', '/s/truss-auth?side=arb-auth-expiry#6'],
	['provenance', '/p/truss-auth/5'],
	['mission-graph', `/g/${process.env.CORTEX_GRAPH ?? 'graph-identity'}`],
	['search', '/search?types=truss.decision,sdd.decision'],
	['keyboard-help', '/', ['?']],
]

await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: process.env.CORTEX_CHROME_CHANNEL ?? 'chrome' })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 })
const errors: string[] = []
page.on('pageerror', (err) => errors.push(err.message))
for (const [name, path, keys] of shots) {
	await page.goto(`${base}${path}`, { waitUntil: 'networkidle' })
	for (const key of keys ?? []) {
		await page.keyboard.press(key)
		await page.waitForLoadState('networkidle')
	}
	await page.waitForTimeout(150)
	await page.screenshot({ path: `${out}${name}.png`, fullPage: true })
	console.info(`${name}.png`)
}
await browser.close()
if (errors.length) {
	console.error(errors.join('\n'))
	process.exitCode = 1
}
