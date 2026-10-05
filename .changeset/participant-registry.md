---
'cynapse': minor
---

Participants are registered (ADR-0013, needs 1 and 8). `registerParticipant({ key, kind, name, registeredBy })`
derives the id as `UUIDv5(key)`, creates the participant's address channel (keyed by `cynapse` and
its id, owned by it, handle from its name) and logs `cynapse.participant.registered` there. Registering
a live key again is a no-op, the same key with another kind fails with `id_conflict`, and a unit
registers itself as a `service`. `retireParticipant` and `renameParticipant` log
`cynapse.participant.retired` and `cynapse.participant.renamed`, and a retired participant is revived
by registering its key again. `resolveAddress(name, { kinds })` matches a live participant's id, name,
or address handle or alias exactly: more than one match fails with `ambiguous_address` (exit `4`),
listing every candidate in `details.candidates`, and none fails with `unknown_address` (exit `5`).
`participants({ status, registeredBy })` lists them for reconciliation. `Participant` gains `status`,
`key` and `registeredBy`; `CynapseError` gains `details`, rendered beside `code` under `--json`; schema
migration 4 makes every existing participant live with no key.
