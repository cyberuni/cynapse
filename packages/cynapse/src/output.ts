/**
 * The single place a command turns a result into bytes.
 *
 * Commands hand over the structured value and a human rendering of it; the format
 * decision lives here so no command ever branches on `process.argv` itself.
 */

export type OutputFormat = 'text' | 'json'

let format: OutputFormat = 'text'

export function setOutputFormat(next: OutputFormat): void {
	format = next
}

export function getOutputFormat(): OutputFormat {
	return format
}

/**
 * `readable` is a thunk so a text-mode rendering costs nothing under `--json`, and
 * vice versa.
 */
export function output(data: unknown, readable: () => string): void {
	console.log(format === 'json' ? JSON.stringify(data, null, 2) : readable())
}

/**
 * An empty result names what was empty (`0 members found`) rather than printing a
 * blank line, so a caller can tell "nothing matched" from "the command did nothing".
 * `extra` carries what the caller still needs from an empty result, such as a token.
 */
export function printEmpty(entity: string, extra: Record<string, string> = {}): void {
	output({ count: 0, entity, items: [], ...extra }, () =>
		[`0 ${entity} found`, ...Object.entries(extra).map(([key, value]) => `${key}: ${value}`)].join('\n'),
	)
}
