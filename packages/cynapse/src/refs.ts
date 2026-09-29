/**
 * Reference shorthands. Inside cynapse a reference to another system is stored as a
 * short, stable string (`gh:cyberuni/cynapse#12`); it becomes a link only when rendered.
 */

export interface RenderedRef {
	ref: string
	/** Absent for a reference with no web address, such as an internal `handle#seq`. */
	url?: string
	markdown: string
}

interface Scheme {
	/** Returns the URL and link text, or undefined when the rest does not parse. */
	render(rest: string): { url: string; text: string } | undefined
}

const GH_REPO = '([\\w.-]+/[\\w.-]+)'

const schemes: Record<string, Scheme> = {
	gh: {
		render(rest) {
			const issue = new RegExp(`^${GH_REPO}#(\\d+)$`).exec(rest)
			if (issue) return { url: `https://github.com/${issue[1]}/issues/${issue[2]}`, text: rest }
			const commit = new RegExp(`^${GH_REPO}@([0-9a-f]{7,40})$`).exec(rest)
			if (commit) return { url: `https://github.com/${commit[1]}/commit/${commit[2]}`, text: rest }
			const branch = new RegExp(`^${GH_REPO}:(.+)$`).exec(rest)
			if (branch) return { url: `https://github.com/${branch[1]}/tree/${branch[2]}`, text: rest }
			const repo = new RegExp(`^${GH_REPO}$`).exec(rest)
			if (repo) return { url: `https://github.com/${repo[1]}`, text: rest }
			return undefined
		},
	},
	npm: {
		render: (rest) => ({ url: `https://www.npmjs.com/package/${rest}`, text: rest }),
	},
	asana: {
		render: (rest) =>
			/^\d+$/.test(rest) ? { url: `https://app.asana.com/0/0/${rest}`, text: `asana:${rest}` } : undefined,
	},
}

export function renderRef(ref: string): RenderedRef {
	if (/^https?:\/\//.test(ref)) return { ref, url: ref, markdown: `<${ref}>` }
	const colon = ref.indexOf(':')
	const scheme = colon > 0 ? schemes[ref.slice(0, colon)] : undefined
	const rendered = scheme?.render(ref.slice(colon + 1))
	if (!rendered) return { ref, markdown: `\`${ref}\`` }
	return { ref, url: rendered.url, markdown: `[${rendered.text}](${rendered.url})` }
}
