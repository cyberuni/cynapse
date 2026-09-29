// Reference shorthands rendered as links. External schemes mirror `renderRef` in the
// cynapse package (gh issue/commit/branch/repo, npm, asana, plain URLs); `handle#seq`
// deep-links to the entry inside Cortex.

export type RefLink = { text: string; href?: string; external?: boolean }

const REPO = '([\\w.-]+/[\\w.-]+)'
const EXTERNAL: [RegExp, (m: RegExpExecArray) => string][] = [
	[/^https?:\/\/\S+$/, (m) => m[0]],
	[new RegExp(`^gh:${REPO}#(\\d+)$`), (m) => `https://github.com/${m[1]}/issues/${m[2]}`],
	[new RegExp(`^gh:${REPO}@([0-9a-f]{7,40})$`), (m) => `https://github.com/${m[1]}/commit/${m[2]}`],
	[new RegExp(`^gh:${REPO}:(.+)$`), (m) => `https://github.com/${m[1]}/tree/${m[2]}`],
	[new RegExp(`^gh:${REPO}$`), (m) => `https://github.com/${m[1]}`],
	[/^npm:(\S+)$/, (m) => `https://www.npmjs.com/package/${m[1]}`],
	[/^asana:(\d+)$/, (m) => `https://app.asana.com/0/0/${m[1]}`],
]
const ENTRY = /^([a-z][\w.-]*)#(\d+)$/
const IN_PROSE =
	/https?:\/\/[^\s)]+|gh:[\w.-]+\/[\w-]+(?:\.[\w-]+)*(?:#\d+|@[0-9a-f]{7,40}|:[\w./-]*[\w/-])?|npm:[\w@/.-]*[\w-]|asana:\d+|\b[a-z][\w-]*#\d+/g

export function linkRef(ref: string): RefLink {
	for (const [pattern, url] of EXTERNAL) {
		const match = pattern.exec(ref)
		if (match) return { text: ref, href: url(match), external: true }
	}
	const entry = ENTRY.exec(ref)
	if (entry) return { text: ref, href: `/s/${entry[1]}#${entry[2]}`, external: false }
	return { text: ref }
}

export function splitRefs(text: string): (string | RefLink)[] {
	const parts: (string | RefLink)[] = []
	let last = 0
	for (const match of text.matchAll(IN_PROSE)) {
		const index = match.index ?? 0
		if (index > last) parts.push(text.slice(last, index))
		parts.push(linkRef(match[0]))
		last = index + match[0].length
	}
	if (last < text.length) parts.push(text.slice(last))
	return parts
}
