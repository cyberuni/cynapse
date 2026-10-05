import { CynapseError } from './cli-error.js'
import { uuidv5 } from './ids.js'

/**
 * A subject's identity in the store that holds it (ADR-0012): GitHub's `node_id`, Asana's
 * `gid`, Linear's UUID. Not the readable reference (`gh:cyberuni/cynapse`), which changes
 * when the subject is renamed; that is the channel's handle.
 */
export interface SubjectId {
	/**
	 * The store, named as in reference shorthands: `gh`, `asana`, `linear`. Lowercase
	 * letters, digits, `.` and `-`. `cynapse` names IDs cynapse mints itself, such as a
	 * participant's ID or the address of a folder with no hosted remote.
	 */
	store: string
	/** The ID exactly as the store returns it; case is kept. */
	nativeId: string
}

const STORE = /^[a-z][a-z0-9.-]*$/
const NATIVE_ID = /^\S+$/

/**
 * The key a subject's channel is derived from: `subject:<store>:<nativeId>`.
 *
 * The format is fixed. Channel IDs are UUIDv5 of this string and are written into every
 * entry, so spelling it differently would split a subject into two channels. Callers pass
 * the store and native ID and never spell the key themselves. The store name has no colon,
 * so the first colon after `subject:` ends it and the native ID may contain colons.
 */
export function channelKey(subject: SubjectId): string {
	if (!STORE.test(subject.store)) {
		throw new CynapseError(`"${subject.store}" is not a valid store name (lowercase letters, digits, . -)`)
	}
	if (!NATIVE_ID.test(subject.nativeId)) {
		throw new CynapseError(`"${subject.nativeId}" is not a valid native id (non-empty, no whitespace)`)
	}
	return `subject:${subject.store}:${subject.nativeId}`
}

/** The channel ID of a subject: UUIDv5 of its `channelKey`, in the cynapse namespace. */
export function channelIdOf(subject: SubjectId): string {
	return uuidv5(channelKey(subject))
}
