// Every view has a URL, and every entry a deep link: `/s/<handle>#<seq>`.

export type Route =
	| { view: 'triage' }
	| { view: 'tree' }
	| { view: 'stream'; handle: string; seq?: number; side?: string }
	| { view: 'provenance'; handle: string; seq: number }
	| { view: 'graph'; handle: string; at?: number }
	| { view: 'search'; types: string[]; tags: string[] }

const csv = (value: string | null) => (value ? value.split(',').filter(Boolean) : [])
const int = (value: string | null | undefined) => (value && /^\d+$/.test(value) ? Number(value) : undefined)

export function parseRoute(pathname: string, search: string, hash: string): Route {
	const params = new URLSearchParams(search)
	const [, head, a, b] = pathname.split('/').map(decodeURIComponent)
	switch (head) {
		case 'tree':
			return { view: 'tree' }
		case 's':
			if (a) {
				const seq = int(hash.slice(1))
				const side = params.get('side') ?? undefined
				return { view: 'stream', handle: a, ...(seq !== undefined && { seq }), ...(side && { side }) }
			}
			break
		case 'p': {
			const seq = int(b)
			if (a && seq !== undefined) return { view: 'provenance', handle: a, seq }
			break
		}
		case 'g':
			if (a) {
				const at = int(params.get('at'))
				return { view: 'graph', handle: a, ...(at !== undefined && { at }) }
			}
			break
		case 'search':
			return { view: 'search', types: csv(params.get('types')), tags: csv(params.get('tags')) }
	}
	return { view: 'triage' }
}

export function routeHref(route: Route): string {
	const enc = encodeURIComponent
	switch (route.view) {
		case 'triage':
			return '/'
		case 'tree':
			return '/tree'
		case 'stream':
			return `/s/${enc(route.handle)}${route.side ? `?side=${enc(route.side)}` : ''}${route.seq ? `#${route.seq}` : ''}`
		case 'provenance':
			return `/p/${enc(route.handle)}/${route.seq}`
		case 'graph':
			return `/g/${enc(route.handle)}${route.at !== undefined ? `?at=${route.at}` : ''}`
		case 'search': {
			const params = new URLSearchParams()
			if (route.types.length) params.set('types', route.types.join(','))
			if (route.tags.length) params.set('tags', route.tags.join(','))
			const query = params.toString().replaceAll('%2C', ',').replaceAll('%3A', ':')
			return `/search${query ? `?${query}` : ''}`
		}
	}
}
