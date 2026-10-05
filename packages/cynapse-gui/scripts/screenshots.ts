// Captures screenshots of every view from a running GUI: `pnpm gui screenshots [base-url]`.
// Targets are discovered through the API, so it works on any database. It uses the
// system Chrome, so no Playwright browser download is needed.
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

type Channel = { handle: string; type: string; state: string; parent?: { seq: number; channelId: string }; id: string }
type Entry = { channel: string; seq: number; parentSeq?: number; type: string }

const base = process.argv[2] ?? 'http://127.0.0.1:5173'
const out = new URL('../screenshots/', import.meta.url).pathname
const get = async <T>(path: string): Promise<T> => (await fetch(`${base}${path}`)).json() as Promise<T>

const channels = await get<Channel[]>('/api/channels')
const byId = new Map(channels.map((s) => [s.id, s]))
const decisions = await get<Entry[]>('/api/search?types=truss.decision,sdd.decision')
const arbitrated = decisions.find((d) => d.type === 'truss.decision' && d.parentSeq) ?? decisions[0]
const child =
	channels.find((s) => s.type.endsWith('.arbitration') && s.state !== 'closed' && s.parent) ??
	channels.find((s) => s.parent)
const parent = child?.parent ? byId.get(child.parent.channelId) : undefined
const reconciled = channels.find((s) => s.state === 'reconciled')
const graph = channels.find((s) => s.type === 'sdd.mission-graph')

const shots: [name: string, path: string | undefined, keys?: string[]][] = [
	['triage', '/'],
	['hierarchy', '/tree'],
	['channel-timeline', parent && child?.parent && `/s/${parent.handle}#${child.parent.seq}`, ['o']],
	['channel-side-by-side', parent && child?.parent && `/s/${parent.handle}?side=${child.handle}#${child.parent.seq}`],
	['channel-distilled', reconciled && `/s/${reconciled.handle}`],
	['provenance', arbitrated && `/p/${arbitrated.channel}/${arbitrated.seq}`],
	['mission-graph', graph && `/g/${graph.handle}`],
	['search', '/search?types=truss.decision,sdd.decision'],
	['keyboard-help', '/', ['?']],
]

await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: process.env.CYNAPSE_GUI_CHROME_CHANNEL ?? 'chrome' })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
const errors: string[] = []
page.on('pageerror', (err) => errors.push(err.message))
for (const [name, path, keys] of shots) {
	if (!path) {
		console.warn(`${name}: nothing to show in this database, skipped`)
		continue
	}
	await page.goto(`${base}${path}`, { waitUntil: 'networkidle' })
	for (const key of keys ?? []) {
		await page.keyboard.press(key)
		await page.waitForLoadState('networkidle')
	}
	await page.waitForTimeout(200)
	await page.screenshot({ path: `${out}${name}.png`, fullPage: true })
	console.info(`${name}.png  ${path}`)
}
await browser.close()
if (errors.length) {
	console.error(errors.join('\n'))
	process.exitCode = 1
}
