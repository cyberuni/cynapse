// Cortex writes as the Council, so its API must answer only the Council's own browser
// and local agents. Binding to loopback keeps other machines out; this middleware keeps
// out other web pages in the same browser.
import type { MiddlewareHandler } from 'hono'

const LOOPBACK = new Set(['localhost', '127.0.0.1'])

/**
 * - The Host must be loopback on the served port, which refuses DNS rebinding (a page
 *   whose own hostname resolves to 127.0.0.1), for reads too.
 * - A write must be `application/json`, which a cross-site form cannot send without a
 *   CORS preflight, and must come from the served origin when it names one.
 */
export function localOnly(options: { port?: number } = {}): MiddlewareHandler {
	return async (c, next) => {
		// The Node adapter builds the request URL from the Host header.
		const url = new URL(c.req.url)
		const portOk = options.port === undefined || url.port === String(options.port)
		if (!LOOPBACK.has(url.hostname) || !portOk) {
			return c.json({ error: `host ${url.host} is not this Cortex; use 127.0.0.1 or localhost` }, 403)
		}
		if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
			const type = c.req.header('content-type') ?? ''
			if (!type.toLowerCase().startsWith('application/json')) {
				return c.json({ error: 'writes must be sent as application/json' }, 403)
			}
			const origin = c.req.header('origin')
			if (origin !== undefined && origin !== url.origin) {
				return c.json({ error: `origin ${origin} may not write to this Cortex` }, 403)
			}
		}
		await next()
	}
}
