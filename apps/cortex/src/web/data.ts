// Fetching from the Cortex API, plus the navigation primitive the views share.
import { useCallback, useEffect, useState } from 'react'
import { type Route, routeHref } from './route.ts'

export function navigate(to: Route | string) {
	const href = typeof to === 'string' ? to : routeHref(to)
	window.history.pushState(null, '', href)
	window.dispatchEvent(new PopStateEvent('popstate'))
}

/** Bumped after a Council action so every view refetches. */
let generation = 0
const listeners = new Set<() => void>()
function invalidate() {
	generation++
	for (const listener of listeners) listener()
}

export function useApi<T>(path: string | undefined): { data?: T; error?: string } {
	const [state, setState] = useState<{ data?: T; error?: string; path?: string }>({})
	const [gen, setGen] = useState(generation)
	useEffect(() => {
		const listener = () => setGen(generation)
		listeners.add(listener)
		return () => {
			listeners.delete(listener)
		}
	}, [])
	useEffect(() => {
		if (!path) return
		let live = true
		fetch(path)
			.then(async (res) => {
				const body = await res.json()
				if (!live) return
				setState(res.ok ? { data: body, path } : { error: body.error ?? res.statusText, path })
			})
			.catch((err: Error) => live && setState({ error: err.message, path }))
		return () => {
			live = false
		}
	}, [path, gen])
	return state.path === path ? state : {}
}

export async function post<T>(path: string, body: unknown): Promise<T> {
	const res = await fetch(path, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	})
	const json = await res.json()
	if (!res.ok) throw new Error(json.error ?? res.statusText)
	invalidate()
	return json
}

function isTyping(event: KeyboardEvent) {
	const target = event.target as HTMLElement | null
	return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
}

/** j/k (and arrows) move through a list, Enter opens the selected item. */
export function useListNav(count: number, onOpen: (index: number) => void, initial = 0) {
	const [index, setIndex] = useState(initial)
	useEffect(() => setIndex((i) => Math.min(i, Math.max(count - 1, 0))), [count])
	const open = useCallback(onOpen, [onOpen])
	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (isTyping(event) || event.metaKey || event.ctrlKey || event.altKey) return
			if (event.key === 'j' || event.key === 'ArrowDown') setIndex((i) => Math.min(i + 1, count - 1))
			else if (event.key === 'k' || event.key === 'ArrowUp') setIndex((i) => Math.max(i - 1, 0))
			else if (event.key === 'Enter' && count > 0) open(index)
			else return
			event.preventDefault()
		}
		window.addEventListener('keydown', handler)
		return () => window.removeEventListener('keydown', handler)
	}, [count, index, open])
	useEffect(() => {
		document.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' })
	}, [index])
	return [index, setIndex] as const
}

/** Single-key bindings for a view; ignored while typing. */
export function useKeys(bindings: Record<string, () => void>) {
	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (isTyping(event) || event.metaKey || event.ctrlKey || event.altKey) return
			const action = bindings[event.key]
			if (action) {
				event.preventDefault()
				action()
			}
		}
		window.addEventListener('keydown', handler)
		return () => window.removeEventListener('keydown', handler)
	}, [bindings])
}

export { isTyping }
