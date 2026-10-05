// Reference shorthands rendered as links. External schemes are cynapse's own
// `renderRef` (browser-safe via `cynapse/refs`); `handle#seq` deep-links to the entry
// inside the GUI.
import { renderRef } from 'cynapse/refs'

export type RefLink = { text: string; href?: string; external?: boolean }

const ENTRY = /^([a-z][\w.-]*)#(\d+)$/
const IN_PROSE =
	/https?:\/\/[^\s)]+|gh:[\w.-]+\/[\w-]+(?:\.[\w-]+)*(?:#\d+|@[0-9a-f]{7,40}|:[\w./-]*[\w/-])?|npm:[\w@/.-]*[\w-]|asana:\d+|\b[a-z][\w-]*#\d+/g

export function linkRef(ref: string): RefLink {
	const { url } = renderRef(ref)
	if (url) return { text: ref, href: url, external: true }
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
