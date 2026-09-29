import { createHash, randomBytes } from 'node:crypto'

/**
 * The namespace cynapse derives stream IDs in. Fixed forever: changing it would give
 * every derived stream a new identity.
 */
export const CYNAPSE_NAMESPACE = '0199a6c4-5b1e-5c3a-9d2f-6e7c8b9a0d1e'

let lastMs = -1
let counter = 0

/**
 * A UUIDv7 (RFC 9562): 48 bits of Unix milliseconds, then a 12-bit counter in `rand_a`
 * so IDs minted in the same millisecond by this process still sort in mint order.
 */
export function uuidv7(now: number = Date.now()): string {
	let ms = now
	// Only a burst inside one millisecond needs the counter. A clock that stepped back is
	// not papered over: arrival order is `seq`'s job, not the ID's.
	if (ms === lastMs) {
		counter++
		if (counter > 0xfff) {
			ms = lastMs + 1
			counter = 0
		}
	} else {
		// Start low in the counter space so a burst has room to count up.
		counter = randomBytes(1)[0] ?? 0
	}
	lastMs = ms

	const bytes = randomBytes(16)
	bytes.writeUIntBE(ms, 0, 6)
	bytes[6] = 0x70 | ((counter >> 8) & 0x0f)
	bytes[7] = counter & 0xff
	bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f)
	return format(bytes)
}

/** The Unix millisecond timestamp a UUIDv7 carries. */
export function timestampOf(id: string): number {
	return Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16)
}

/** A UUIDv5 (SHA-1, name-based): the same name in the same namespace always gives the same ID. */
export function uuidv5(name: string, namespace: string = CYNAPSE_NAMESPACE): string {
	const hash = createHash('sha1')
		.update(Buffer.from(namespace.replaceAll('-', ''), 'hex'))
		.update(name)
		.digest()
	const bytes = hash.subarray(0, 16)
	bytes[6] = 0x50 | ((bytes[6] ?? 0) & 0x0f)
	bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f)
	return format(bytes)
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
	return UUID_PATTERN.test(value)
}

function format(bytes: Buffer): string {
	const hex = bytes.toString('hex')
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
