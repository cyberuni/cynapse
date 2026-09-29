// Reference shorthands rendered as links: `gh:owner/repo#n` goes to GitHub, and
// `handle#seq` deep-links to the entry inside Cortex.

export type RefLink = { text: string; href?: string; external?: boolean }

const GH = /^gh:([\w.-]+\/[\w.-]+)(?:#(\d+))?$/
const ENTRY = /^([a-z][\w.-]*)#(\d+)$/
const IN_PROSE = /gh:[\w.-]+\/[\w-]+(?:\.[\w-]+)*(?:#\d+)?|\b[a-z][\w-]*#\d+/g

export function linkRef(ref: string): RefLink {
	const gh = GH.exec(ref)
	if (gh) {
		const href = `https://github.com/${gh[1]}${gh[2] ? `/issues/${gh[2]}` : ''}`
		return { text: ref, href, external: true }
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
