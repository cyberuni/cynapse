import type { Entry, Participant, Store } from '../store/types.js'

/**
 * A mutable clock for the seed: each write lands a few minutes after the last, so the
 * example world reads as a week of work rather than one burst.
 */
export class SeedClock {
	#now: number

	constructor(start: number) {
		this.#now = start
	}

	now = (): number => this.#now

	advance(minutes: number): void {
		this.#now += minutes * 60_000
	}
}

/** When the example world starts: Monday 2026-09-21, 09:00 UTC. */
export const SEED_START = Date.UTC(2026, 8, 21, 9, 0, 0)

const PARTICIPANTS: Participant[] = [
	{ id: 'council', kind: 'human', name: 'Council' },
	{ id: 'sdd-conductor', kind: 'agent', name: 'SDD conductor' },
	{ id: 'sdd-spec-judge', kind: 'agent', name: 'SDD spec-judge (cold)' },
	{ id: 'sdd-impl-judge', kind: 'agent', name: 'SDD impl-judge (cold)' },
	{ id: 'sdd-scanner', kind: 'agent', name: 'SDD doctrine Scanner' },
	{ id: 'operator', kind: 'agent', name: 'Fleet operator' },
	{ id: 'pod-store', kind: 'agent', name: 'Pod: store' },
	{ id: 'pod-viewer', kind: 'agent', name: 'Pod: viewer' },
	{ id: 'wf-feature-delivery', kind: 'agent', name: 'Workflow: feature delivery' },
	{ id: 'wf-docs-update', kind: 'agent', name: 'Workflow: docs update' },
	{ id: 'wf-design', kind: 'agent', name: 'Workflow: design' },
	{ id: 'wf-release', kind: 'agent', name: 'Workflow: release' },
	{ id: 'truss-ledger', kind: 'service', name: 'cyber-truss run ledger' },
	{ id: 'ci', kind: 'service', name: 'GitHub Actions' },
	{ id: 'git-watch', kind: 'service', name: 'Trunk watcher' },
]

export interface SeedSummary {
	participants: number
	streams: { handle: string; type: string; state: string; entries: number }[]
	entries: number
	openNeedsInput: number
	councilUnread: number
}

/**
 * Builds a navigable example world: an SDD work hierarchy, an SDD mission graph, a
 * cyber-truss mission with arbitration, agent coordination, a change feed, and a DM —
 * with unread items and pending decisions waiting for the Council.
 */
export function seed(store: Store, clock: SeedClock): SeedSummary {
	for (const participant of PARTICIPANTS) store.addParticipant(participant)
	const w = new World(store, clock)

	seedWorkHierarchy(w)
	seedMissionGraph(w)
	seedTruss(w)
	seedCoordination(w)
	seedFeed(w)
	seedDm(w)

	const streams = store.listStreams()
	return {
		participants: store.participants().length,
		streams: streams.map((s) => ({ handle: s.handle, type: s.type, state: s.state, entries: s.stats.entries })),
		entries: streams.reduce((sum, s) => sum + s.stats.entries, 0),
		openNeedsInput: store.states({ kind: 'needs-input', status: 'open' }).length,
		councilUnread: store.unread('council').reduce((sum, u) => sum + u.count, 0),
	}
}

/** Thin helpers so the seed reads as a script of what happened. */
class World {
	constructor(
		readonly store: Store,
		readonly clock: SeedClock,
	) {}

	post(
		stream: string,
		author: string,
		type: string,
		body = '',
		extra: { data?: Record<string, unknown>; tags?: string[]; refs?: string[]; parent?: string; minutes?: number } = {},
	): Entry {
		this.clock.advance(extra.minutes ?? 7)
		return this.store.append(stream, {
			author,
			type,
			body,
			data: extra.data,
			tags: extra.tags,
			refs: extra.refs,
			parent: extra.parent,
		})
	}

	later(minutes: number): void {
		this.clock.advance(minutes)
	}

	members(stream: string, author: string, members: [participant: string, role: string][]): void {
		for (const [participant, role] of members) {
			this.clock.advance(1)
			this.store.addMember(stream, participant, role, author)
		}
	}

	context(stream: string, author: string, refs: string[]): void {
		for (const ref of refs) {
			this.clock.advance(1)
			this.store.addContext(stream, ref, author)
		}
	}
}

// ── SDD work hierarchy ────────────────────────────────────────────────────────

function seedWorkHierarchy(w: World): void {
	const { store } = w
	store.createStream({
		handle: 'init-agent-comms',
		type: 'sdd.initiative',
		title: 'Agent communication layer',
		purpose: 'Give agents a persisted communication layer: ledgers, discussions, coordination, change feeds.',
		author: 'council',
		conventions: ['sdd.work-hierarchy', 'cynapse.stream-briefing'],
	})
	w.members('init-agent-comms', 'council', [
		['council', 'owner'],
		['sdd-conductor', 'conductor'],
		['operator', 'dispatcher'],
	])
	w.context('init-agent-comms', 'council', ['gh:cyberuni/cynapse', 'gh:cyberuni/cyberlegion#20'])
	w.post(
		'init-agent-comms',
		'council',
		'sdd.note',
		'Extract messaging out of cyberlegion into cynapse. Two epics: the store, and a viewer the Council can read decisions in.',
	)

	// Epic: persisted store
	const storeAnchor = w.post('init-agent-comms', 'sdd-conductor', 'sdd.epic.opened', 'Epic: persisted store', {
		data: { epic: 'epic-store', title: 'Persisted store' },
		refs: ['gh:cyberuni/cynapse#16'],
	})
	store.createStream({
		handle: 'epic-store',
		type: 'sdd.epic',
		title: 'Persisted store',
		purpose: 'Streams of immutable entries on stock SQLite, with owner-assigned seq.',
		author: 'sdd-conductor',
		anchor: storeAnchor.id,
		conventions: ['sdd.work-hierarchy'],
	})
	w.members('epic-store', 'sdd-conductor', [
		['sdd-conductor', 'conductor'],
		['pod-store', 'pod'],
		['council', 'approver'],
	])
	w.context('epic-store', 'sdd-conductor', ['gh:cyberuni/cynapse#16'])

	// Epic: viewer
	const viewerAnchor = w.post('init-agent-comms', 'sdd-conductor', 'sdd.epic.opened', 'Epic: Cortex viewer', {
		data: { epic: 'epic-viewer', title: 'Cortex viewer' },
		refs: ['gh:cyberuni/cynapse#17'],
	})
	store.createStream({
		handle: 'epic-viewer',
		type: 'sdd.epic',
		title: 'Cortex viewer',
		purpose: 'A web viewer where the Council inspects conversations and decisions.',
		author: 'sdd-conductor',
		anchor: viewerAnchor.id,
	})
	w.members('epic-viewer', 'sdd-conductor', [
		['sdd-conductor', 'conductor'],
		['pod-viewer', 'pod'],
		['council', 'approver'],
	])

	seedReconciledMission(w)
	seedPausedMission(w)
	seedViewerMission(w)

	// The Council has read the initiative, and the store epic up to its first mission.
	store.markRead('init-agent-comms', 'council')
	store.markRead('epic-store', 'council', 6)
}

/** A finished mission: raw ledger is every entry, distilled ledger is a view, state `reconciled`. */
function seedReconciledMission(w: World): void {
	const { store } = w
	const anchor = w.post(
		'epic-store',
		'sdd-conductor',
		'sdd.mission.opened',
		'Mission: assign seq under the write lock',
		{
			data: { mission: 'm-seq-order', cr: 'github-18' },
			refs: ['gh:cyberuni/cynapse#18'],
		},
	)
	store.createStream({
		handle: 'm-seq-order',
		type: 'sdd.mission',
		title: 'Assign seq under the write lock',
		purpose: 'seq is assigned inside BEGIN IMMEDIATE as the stream’s last seq + 1; no daemon.',
		author: 'sdd-conductor',
		anchor: anchor.id,
		conventions: ['sdd.mission-ledger', 'sdd.leash'],
	})
	const m = 'm-seq-order'
	w.members(m, 'sdd-conductor', [
		['sdd-conductor', 'conductor'],
		['pod-store', 'producer'],
		['sdd-spec-judge', 'spec-judge'],
		['sdd-impl-judge', 'impl-judge'],
		['council', 'approver'],
	])
	w.context(m, 'sdd-conductor', ['gh:cyberuni/cynapse#18', 'gh:cyberuni/cynapse:feat/seq-order'])

	w.post(m, 'sdd-conductor', 'sdd.leash', 'Leash auto-spec, derived from blast medium.', {
		data: { leash: 'auto-spec', by: 'derived', blast: 'medium', approach: ['no-spike', 'worktree'] },
	})
	w.post(
		m,
		'pod-store',
		'sdd.note',
		'Draft spec: seq contiguous per stream under 10+ concurrent writers; UUIDv7 ids are idempotency keys.',
	)
	const judge1 = w.post(
		m,
		'sdd-spec-judge',
		'sdd.judge',
		'Iteration 1: oracle FAIL (no gap-detection scenario), builder PASS, architect FAIL (daemon implied).',
		{
			data: { iteration: 1, oracle: 'fail', builder: 'pass', architect: 'fail', aligned: false },
			tags: ['sdd.remediation'],
		},
	)
	w.post(m, 'pod-store', 'sdd.note', 'Remediated: added gap-detection scenario; removed the daemon wording.', {
		parent: judge1.id,
	})
	w.post(m, 'sdd-spec-judge', 'sdd.judge', 'Iteration 2: ALIGNED true, additive 8 scenarios.', {
		data: { iteration: 2, oracle: 'pass', builder: 'pass', architect: 'pass', aligned: true, additive: 8 },
		parent: judge1.id,
	})
	w.post(m, 'sdd-conductor', 'sdd.gate', 'Spec gate: approve (self-asserted within leash).', {
		data: {
			gate: 'spec',
			verdict: 'approve',
			by: 'agent',
			cause: 'dimension',
			frozen: ['seq-order.feature'],
			why: 'aligned on iteration 2; all scenarios additive',
		},
	})

	// A question that needed the Council, answered and resolved.
	const escalation = w.post(
		m,
		'sdd-conductor',
		'sdd.escalation',
		'Should a stream’s seq survive a compaction, or restart? Compaction is a retention step, so this touches the hard floor.',
		{ data: { floor: 'consent' }, tags: ['council.attention'] },
	)
	store.setState(
		m,
		{ key: 'compaction-seq', kind: 'needs-input', status: 'open', subject: 'council', entryId: escalation.id },
		'sdd-conductor',
	)
	w.later(95)
	w.post(
		m,
		'council',
		'council.answer',
		'seq never restarts. A compaction records the removed range so readers can tell it from a gap.',
		{
			parent: escalation.id,
		},
	)
	store.setState(
		m,
		{ key: 'compaction-seq', kind: 'needs-input', status: 'resolved', subject: 'council', entryId: escalation.id },
		'council',
	)
	const decision = w.post(
		m,
		'sdd-conductor',
		'sdd.decision',
		'seq is monotonic for the life of a stream; compaction records removed ranges.',
		{
			refs: [`${m}#${escalation.seq}`],
			tags: ['sdd.criteria'],
		},
	)

	w.post(
		m,
		'pod-store',
		'sdd.note',
		'Implementation up: BEGIN IMMEDIATE + MAX(seq)+1; load test 12 writers × 200 clean.',
		{
			refs: ['gh:cyberuni/cynapse#19'],
		},
	)
	w.post(m, 'sdd-impl-judge', 'sdd.judge', 'Impl: 8/8 scenarios pass; integrity_check ok.', {
		data: { gate: 'impl', scenarios: { pass: 8, fail: 0 } },
	})
	w.post(m, 'sdd-conductor', 'sdd.gate', 'Impl gate: approve.', {
		data: {
			gate: 'impl',
			verdict: 'approve',
			by: 'council',
			cause: 'ceiling',
			why: 'leash auto-spec stops at impl gate',
		},
		refs: ['gh:cyberuni/cynapse#19'],
	})
	w.post(m, 'sdd-conductor', 'sdd.followup', 'Backlog: busy_timeout is fixed at 10s; make it configurable per store.', {
		data: { class: 'backlog' },
		refs: ['gh:cyberuni/cynapse#21'],
	})
	w.post(
		m,
		'sdd-scanner',
		'sdd.strategy',
		'Ship: missions touching the order owner should always carry a load-test scenario.',
		{
			data: { ratified: false, distills: 'github-18', disposition: 'open', recommendation: 'ship' },
		},
	)
	const summary = w.post(
		m,
		'sdd-conductor',
		'cynapse.summary',
		'Merged as #19. seq assigned under BEGIN IMMEDIATE; monotonic for the stream’s life (Council, compaction). One backlog followup (#21). Scanner recommends a load-test rule.',
		{ refs: ['gh:cyberuni/cynapse#19'] },
	)
	store.pin(summary.id, 'sdd-conductor')
	store.pin(decision.id, 'sdd-conductor')
	store.defineView(
		m,
		'distilled',
		{ types: ['sdd.leash', 'sdd.gate', 'sdd.decision', 'sdd.followup', 'sdd.strategy', 'cynapse.summary'] },
		'sdd-scanner',
	)
	w.later(30)
	store.setLifecycle(m, 'reconciled', 'sdd-scanner')
	w.post('epic-store', 'sdd-conductor', 'sdd.mission.retired', 'm-seq-order merged (#19) and reconciled.', {
		refs: [`epic-store#${anchor.seq}`, 'gh:cyberuni/cynapse#19'],
		parent: anchor.id,
	})
	store.markRead(m, 'council')
}

/** An in-flight mission paused at the spec gate, waiting on the Council. */
function seedPausedMission(w: World): void {
	const { store } = w
	const anchor = w.post('epic-store', 'sdd-conductor', 'sdd.mission.opened', 'Mission: stream identity and handles', {
		data: { mission: 'm-stream-ids', cr: 'github-22' },
		refs: ['gh:cyberuni/cynapse#22'],
	})
	store.createStream({
		handle: 'm-stream-ids',
		type: 'sdd.mission',
		title: 'Stream identity and renameable handles',
		purpose: 'UUIDv5 for anchored and keyed streams, UUIDv7 otherwise; handles rename with aliases.',
		author: 'sdd-conductor',
		anchor: anchor.id,
		conventions: ['sdd.mission-ledger', 'sdd.leash'],
	})
	const m = 'm-stream-ids'
	w.members(m, 'sdd-conductor', [
		['sdd-conductor', 'conductor'],
		['pod-store', 'producer'],
		['sdd-spec-judge', 'spec-judge'],
		['council', 'approver'],
	])
	w.context(m, 'sdd-conductor', ['gh:cyberuni/cynapse#22'])
	w.post(m, 'sdd-conductor', 'sdd.leash', 'Leash auto-spec.', {
		data: { leash: 'auto-spec', by: 'derived', blast: 'high', approach: ['spike', 'worktree'] },
	})
	store.markRead(m, 'council')
	w.post(
		m,
		'pod-store',
		'sdd.note',
		'Spike: deriving ids makes concurrent opens converge; handle collisions still need a rule.',
		{
			tags: ['sdd.spike'],
		},
	)
	w.post(
		m,
		'sdd-spec-judge',
		'sdd.judge',
		'Round 3: ALIGNED; but where the handle namespace lives is a placement question.',
		{
			data: { iteration: 3, aligned: true },
		},
	)
	const gate = w.post(
		m,
		'sdd-conductor',
		'sdd.gate',
		'Spec gate: pause. Placement of the handle namespace needs the Council.',
		{
			data: {
				gate: 'spec',
				verdict: 'pause',
				by: 'agent',
				cause: 'council-placement',
				why: 'per-project or global handle namespace is a Council placement call',
			},
			tags: ['council.attention'],
			refs: ['gh:cyberuni/cynapse#22'],
		},
	)
	store.setState(
		m,
		{
			key: 'handle-namespace',
			kind: 'needs-input',
			status: 'open',
			subject: 'council',
			entryId: gate.id,
			value: { question: 'Per-project or global handle namespace?', options: ['per-project', 'global'] },
		},
		'sdd-conductor',
	)
	w.post(m, 'sdd-conductor', 'sdd.halt', 'Holding before deliver until the Council answers.', { parent: gate.id })
}

function seedViewerMission(w: World): void {
	const { store } = w
	const anchor = w.post('epic-viewer', 'sdd-conductor', 'sdd.mission.opened', 'Mission: Cortex app shell', {
		data: { mission: 'm-cortex-shell', cr: 'github-23' },
		refs: ['gh:cyberuni/cynapse#23'],
	})
	store.createStream({
		handle: 'm-cortex-shell',
		type: 'sdd.mission',
		title: 'Cortex app shell',
		purpose: 'Stream tree, entry timeline, Council inbox.',
		author: 'sdd-conductor',
		anchor: anchor.id,
	})
	const m = 'm-cortex-shell'
	w.members(m, 'sdd-conductor', [
		['sdd-conductor', 'conductor'],
		['pod-viewer', 'producer'],
		['council', 'approver'],
	])
	w.post(m, 'sdd-conductor', 'sdd.leash', 'Leash auto-all: low blast, UI only.', {
		data: { leash: 'auto-all', by: 'derived', blast: 'low', approach: ['no-spike'] },
	})
	w.post(m, 'sdd-conductor', 'sdd.gate', 'Spec gate: approve (provisional under auto-all).', {
		data: { gate: 'spec', verdict: 'approve', by: 'agent', cause: 'dimension', provisional: true },
	})
	w.post(m, 'pod-viewer', 'sdd.note', 'Building against the store read API agreed on thread cortex-api.', {
		refs: ['gh:cyberuni/cynapse#23'],
	})
}

// ── SDD mission graph ─────────────────────────────────────────────────────────

function seedMissionGraph(w: World): void {
	const { store } = w
	store.createStream({
		handle: 'graph-agent-comms',
		type: 'sdd.mission-graph',
		title: 'Mission graph: agent communication layer',
		purpose: 'Nodes, dependency edges, the ready frontier, claims and retirements, replayable from the entries.',
		author: 'operator',
		conventions: ['sdd.mission-graph'],
	})
	const g = 'graph-agent-comms'
	w.members(g, 'operator', [
		['operator', 'graph-writer'],
		['sdd-conductor', 'reader'],
		['council', 'observer'],
	])
	w.context(g, 'operator', ['gh:cyberuni/cynapse'])

	const node = (id: string, kind: string, title: string, extra: Record<string, unknown> = {}) =>
		w.post(g, 'operator', 'sdd.graph.node', `${kind} ${id}: ${title}`, {
			data: { node: id, kind, title, status: 'open', ...extra },
			minutes: 2,
		})
	const edge = (from: string, to: string, kind = 'RAW') =>
		w.post(g, 'operator', 'sdd.graph.edge', `${from} → ${to} (${kind})`, { data: { from, to, kind }, minutes: 1 })
	const frontier = (ready: string[], why: Record<string, string>) =>
		w.post(g, 'operator', 'sdd.graph.frontier', `ready: ${ready.join(', ') || 'none'}`, {
			data: { ready, whyReady: why },
			minutes: 1,
		})
	const claim = (id: string, by: string) =>
		w.post(g, by, 'sdd.graph.claim', `${by} claimed ${id}`, { data: { node: id, by } })
	const retire = (id: string, outcome: string, refs: string[] = []) =>
		w.post(g, 'operator', 'sdd.graph.retire', `${id} retired: ${outcome}`, { data: { node: id, outcome }, refs })

	node('op-store', 'operation', 'Persisted store', { capstone: 'm-load-test', releaseFloor: '0.1.0' })
	node('m-seq-order', 'mission', 'Assign seq under the write lock', {
		stream: 'm-seq-order',
		blast: 'medium',
		touchSet: ['packages/cynapse/src/store/**'],
	})
	node('m-stream-ids', 'mission', 'Stream identity and handles', {
		stream: 'm-stream-ids',
		blast: 'high',
		touchSet: ['packages/cynapse/src/store/**', 'packages/cynapse/src/ids.ts'],
	})
	node('m-refs', 'mission', 'Reference shorthands', { blast: 'low', touchSet: ['packages/cynapse/src/refs.ts'] })
	node('m-load-test', 'mission', 'Load test (capstone)', { blast: 'low', touchSet: ['packages/cynapse/src/dev/**'] })
	node('m-cortex-shell', 'mission', 'Cortex app shell', {
		stream: 'm-cortex-shell',
		blast: 'low',
		touchSet: ['apps/cortex/**'],
	})
	edge('op-store', 'm-seq-order', 'parent-child')
	edge('op-store', 'm-stream-ids', 'parent-child')
	edge('op-store', 'm-refs', 'parent-child')
	edge('op-store', 'm-load-test', 'parent-child')
	edge('m-seq-order', 'm-stream-ids')
	edge('m-seq-order', 'm-load-test')
	edge('m-stream-ids', 'm-load-test')
	edge('m-stream-ids', 'm-cortex-shell')
	frontier(['m-seq-order', 'm-refs'], {
		'm-seq-order': 'no RAW predecessors',
		'm-refs': 'no RAW predecessors; touch-set disjoint from m-seq-order',
	})
	claim('m-seq-order', 'pod-store')
	claim('m-refs', 'pod-viewer')
	w.later(240)
	retire('m-refs', 'merged', ['gh:cyberuni/cynapse#20'])
	frontier([], { 'm-stream-ids': 'held: RAW predecessor m-seq-order not retired' })
	w.later(600)
	retire('m-seq-order', 'merged', ['gh:cyberuni/cynapse#19'])
	frontier(['m-stream-ids'], { 'm-stream-ids': 'RAW predecessor m-seq-order retired' })
	claim('m-stream-ids', 'pod-store')
	w.post(g, 'operator', 'sdd.graph.node', 'm-dm-dedup: discovered while speccing m-stream-ids', {
		data: { node: 'm-dm-dedup', kind: 'mission', title: 'DM deduplication', status: 'open', blast: 'low' },
	})
	edge('m-stream-ids', 'm-dm-dedup', 'discovered-from')
	w.post(g, 'operator', 'sdd.graph.tombstone', 'Retract m-dm-dedup: covered by keyed stream ids in m-stream-ids.', {
		data: { node: 'm-dm-dedup', reason: 'covered by keyed stream ids' },
	})
	frontier([], { 'm-load-test': 'held: m-stream-ids claimed', 'm-cortex-shell': 'held: m-stream-ids claimed' })
}

// ── cyber-truss ───────────────────────────────────────────────────────────────

function seedTruss(w: World): void {
	const { store } = w
	store.createStream({
		handle: 'truss-pagination',
		type: 'truss.mission',
		title: 'Fix pagination rounding',
		purpose:
			'A developer fixed pagination in {code, test}; propagate the change through the artifact sets until the repo settles.',
		author: 'truss-ledger',
		conventions: ['cyber-truss.run-ledger', 'cyber-truss.arbitration'],
	})
	const m = 'truss-pagination'
	w.members(m, 'truss-ledger', [
		['truss-ledger', 'run-ledger'],
		['wf-feature-delivery', 'workflow'],
		['wf-docs-update', 'workflow'],
		['wf-design', 'workflow'],
		['wf-release', 'workflow'],
		['council', 'approver'],
	])
	w.context(m, 'truss-ledger', ['gh:cyberuni/cyber-truss#41', 'gh:cyberuni/cyber-truss:fix/pagination'])

	const land = w.post(m, 'truss-ledger', 'truss.land', 'Change landed in {code, test}: page count now rounds up.', {
		data: { set: '{code, test}', criteriaVersion: 1, commit: 'a1b2c3d' },
		refs: ['gh:cyberuni/cyber-truss@a1b2c3d'],
	})
	w.post(m, 'wf-feature-delivery', 'truss.distill', 'Intent: "round page count up".', {
		data: { workflow: 'feature-delivery', intent: 'round page count up', from: land.id },
		refs: [`${m}#${land.seq}`],
	})
	w.post(m, 'wf-docs-update', 'truss.abstain', 'Nothing in {user docs} span for a rounding change.', {
		data: { workflow: 'docs-update' },
	})
	w.post(m, 'truss-ledger', 'truss.controller.answer', '{spec} is affected: it lacks the round-up rule.', {
		data: { set: '{spec}', answer: 'affected' },
	})
	w.post(m, 'truss-ledger', 'truss.controller.answer', '{PRD} is too coarse to hold a rounding rule.', {
		data: { set: '{PRD}', answer: 'too coarse' },
	})
	const specWrite = w.post(
		m,
		'wf-feature-delivery',
		'truss.contribution',
		'Replace "round down, plus one" with "round up" in the pagination spec.',
		{
			data: {
				set: '{spec}',
				artifacts: ['spec'],
				workflow: 'feature-delivery',
				provenance: { from: `${m}#${land.seq}`, cause: 'distilled from the landed change', readSource: true },
			},
			refs: [`${m}#${land.seq}`],
		},
	)
	w.post(m, 'truss-ledger', 'truss.leash', 'Leash stops: the write removes a rule from the standing specification.', {
		data: { outcome: 'stops', reason: 'removes a standing criterion' },
		parent: specWrite.id,
	})
	w.post(m, 'council', 'truss.approve', 'Approved: the old rule was the bug.', { parent: specWrite.id, minutes: 40 })
	const design = w.post(
		m,
		'wf-design',
		'truss.contribution',
		'Mockup criterion: hide the page indicator when there is only one page.',
		{
			data: {
				set: '{code, test}',
				artifacts: ['mockups'],
				workflow: 'design',
				provenance: { from: `${m}#${specWrite.seq}`, cause: 'routed job from the spec write', readSource: false },
			},
			refs: [`${m}#${specWrite.seq}`],
		},
	)
	const spec = w.post(
		m,
		'wf-feature-delivery',
		'truss.contribution',
		'Spec criterion: the indicator always shows the total page count.',
		{
			data: {
				set: '{code, test}',
				artifacts: ['spec'],
				workflow: 'feature-delivery',
				provenance: { from: `${m}#${specWrite.seq}`, cause: 'join at {code, test}', readSource: true },
			},
			refs: [`${m}#${specWrite.seq}`],
		},
	)

	// Arbitration 1: the join has no state that meets both criteria; the electorate agrees.
	const arb1Anchor = w.post(
		m,
		'truss-ledger',
		'truss.arbitration-needed',
		'Conflict at {code, test}: "hide the indicator on one page" and "indicator always shows total" cannot both hold. Replay only moves the strain.',
		{
			data: { set: '{code, test}', criteriaVersion: 1, contributions: [design.id, spec.id] },
			refs: [`${m}#${design.seq}`, `${m}#${spec.seq}`],
			tags: ['truss.conflict'],
		},
	)
	store.createStream({
		handle: 'truss-pagination-arb-1',
		type: 'truss.arbitration',
		title: 'Indicator on a single page',
		purpose: 'Reach consensus on the page-indicator conflict at {code, test}.',
		author: 'truss-ledger',
		anchor: arb1Anchor.id,
		traits: { membership: 'fixed', wake: true },
		conventions: ['cyber-truss.arbitration'],
	})
	const a1 = 'truss-pagination-arb-1'
	w.members(a1, 'truss-ledger', [
		['wf-design', 'proposer'],
		['wf-feature-delivery', 'proposer'],
		['wf-docs-update', 'elector'],
		['wf-release', 'elector'],
		['truss-ledger', 'clerk'],
	])
	store.setState(
		a1,
		{
			key: 'answers',
			kind: 'pending-answers',
			status: 'open',
			value: { waiting: ['wf-design', 'wf-feature-delivery', 'wf-docs-update', 'wf-release'] },
		},
		'truss-ledger',
	)
	const proposal = w.post(
		a1,
		'wf-design',
		'truss.proposal',
		'Proposal: the indicator shows the total page count, and hides only when the total is 1.',
		{ data: { criterion: 'indicator shows total; hidden when total = 1' } },
	)
	w.post(
		a1,
		'wf-feature-delivery',
		'truss.answer.agree',
		'Agree: this refines the spec criterion without reversing it.',
		{
			parent: proposal.id,
		},
	)
	store.setState(
		a1,
		{ key: 'answers', kind: 'pending-answers', status: 'open', value: { waiting: ['wf-docs-update', 'wf-release'] } },
		'truss-ledger',
	)
	w.post(a1, 'wf-docs-update', 'truss.answer.yield', 'Uncontested: no {user docs} criterion either way.', {
		parent: proposal.id,
	})
	w.post(a1, 'wf-release', 'truss.answer.agree', 'Agree; the changelog notes it as a fix.', { parent: proposal.id })
	store.setState(
		a1,
		{ key: 'answers', kind: 'pending-answers', status: 'resolved', value: { waiting: [] } },
		'truss-ledger',
	)
	w.post(a1, 'truss-ledger', 'truss.consensus', 'Consensus: 3 agree/propose, 1 yield. Criteria version 2.', {
		data: { agree: 3, yield: 1, disagree: 0, criteriaVersion: 2 },
	})
	store.setLifecycle(a1, 'closed', 'truss-ledger')
	const decision1 = w.post(
		m,
		'truss-ledger',
		'truss.decision',
		'Decided (criteria v2): the indicator shows the total page count and hides when the total is 1.',
		{
			parent: arb1Anchor.id,
			refs: [`${a1}#${store.getStream(a1)?.stats.lastSeq ?? 1}`],
			data: { arbitration: a1, criteriaVersion: 2 },
			tags: ['truss.criteria-v2'],
		},
	)
	w.post(m, 'council', 'truss.ratify', 'Ratified.', { parent: decision1.id, minutes: 55 })
	store.pin(decision1.id, 'truss-ledger')

	// Arbitration 2: the release workflow requests a recess, the electorate splits, and it
	// escalates to the Council, where it is still waiting.
	const release = w.post(m, 'wf-release', 'truss.contribution', 'Output {published package}: ship as a patch.', {
		data: {
			set: '{published package}',
			artifacts: ['changelog', 'published package'],
			workflow: 'release',
			provenance: { from: `${m}#${decision1.seq}`, cause: 'routed from the settled {code, test}', readSource: true },
		},
		refs: [`${m}#${decision1.seq}`],
	})
	const arb2Anchor = w.post(
		m,
		'truss-ledger',
		'truss.arbitration-needed',
		'Release as patch or minor? Hiding the indicator is visible behavior; feature delivery reads it as a feature.',
		{
			data: { set: '{published package}', criteriaVersion: 2, contributions: [release.id] },
			refs: [`${m}#${release.seq}`],
			tags: ['truss.conflict'],
		},
	)
	store.createStream({
		handle: 'truss-pagination-arb-2',
		type: 'truss.arbitration',
		title: 'Patch or minor',
		purpose: 'Decide the release level for the pagination fix.',
		author: 'truss-ledger',
		anchor: arb2Anchor.id,
		traits: { membership: 'fixed', wake: true },
		conventions: ['cyber-truss.arbitration'],
	})
	const a2 = 'truss-pagination-arb-2'
	w.members(a2, 'truss-ledger', [
		['wf-release', 'proposer'],
		['wf-feature-delivery', 'elector'],
		['wf-design', 'elector'],
		['wf-docs-update', 'elector'],
		['truss-ledger', 'clerk'],
		['council', 'arbiter'],
	])
	store.setState(
		a2,
		{
			key: 'answers',
			kind: 'pending-answers',
			status: 'open',
			value: { waiting: ['wf-feature-delivery', 'wf-design', 'wf-docs-update'] },
		},
		'truss-ledger',
	)
	const p2 = w.post(a2, 'wf-release', 'truss.proposal', 'Proposal: patch. The rounding was a bug.', {
		data: { level: 'patch' },
	})
	w.post(a2, 'wf-feature-delivery', 'truss.answer.disagree', 'Disagree: hiding the indicator is new behavior. Minor.', {
		parent: p2.id,
		data: { counter: 'minor' },
	})
	w.post(
		a2,
		'wf-design',
		'truss.answer.request-recess',
		'Request recess: the design system team decides what counts as visible behavior.',
		{
			parent: p2.id,
		},
	)
	w.post(a2, 'wf-docs-update', 'truss.answer.yield', 'Uncontested / yield.', { parent: p2.id })
	store.setState(
		a2,
		{ key: 'answers', kind: 'pending-answers', status: 'resolved', value: { waiting: [], split: true } },
		'truss-ledger',
	)
	const escalation = w.post(
		a2,
		'truss-ledger',
		'truss.escalation',
		'No consensus (1 patch, 1 minor, 1 recess, 1 yield). An agent may not decide a release level against a disagreement: escalating to the Council.',
		{ data: { tally: { patch: 1, minor: 1, recess: 1, yield: 1 } }, tags: ['council.attention'] },
	)
	store.setState(
		a2,
		{
			key: 'escalation',
			kind: 'needs-input',
			status: 'open',
			subject: 'council',
			entryId: escalation.id,
			value: { question: 'Release the pagination fix as a patch or a minor?', options: ['patch', 'minor'] },
		},
		'truss-ledger',
	)
	store.setLifecycle(a2, 'escalated', 'truss-ledger')
	store.markRead(m, 'council', decision1.seq)
}

// ── coordination, change feed, DM ─────────────────────────────────────────────

function seedCoordination(w: World): void {
	const { store } = w
	store.createStream({
		handle: 'coord-cynapse',
		type: 'coord.channel',
		title: 'cynapse agents',
		purpose: 'Who is working on what in cyberuni/cynapse; claims, leases and handoffs.',
		author: 'operator',
		traits: { membership: 'open', wake: false },
	})
	const c = 'coord-cynapse'
	w.members(c, 'operator', [
		['operator', 'dispatcher'],
		['pod-store', 'member'],
		['pod-viewer', 'member'],
		['sdd-conductor', 'member'],
		['council', 'observer'],
	])
	w.post(
		c,
		'operator',
		'coord.dispatch',
		'pod-store takes m-stream-ids; pod-viewer takes m-cortex-shell. Store merges first.',
		{
			refs: ['m-stream-ids#1', 'm-cortex-shell#1'],
		},
	)
	const lease = w.post(c, 'pod-store', 'coord.lease', 'Leasing packages/cynapse/src/store/** for m-stream-ids.', {
		data: { paths: ['packages/cynapse/src/store/**'], exclusive: true, ttlMinutes: 240 },
	})
	store.setState(
		c,
		{
			key: 'lease:packages/cynapse/src/store/**',
			kind: 'lease',
			status: 'open',
			subject: 'pod-store',
			entryId: lease.id,
			value: { paths: ['packages/cynapse/src/store/**'], exclusive: true, ttlMinutes: 240 },
		},
		'pod-store',
	)
	const question = w.post(c, 'pod-viewer', 'coord.question', 'Is Store sync or async? I would rather not wrap twice.')
	w.post(
		c,
		'pod-store',
		'coord.answer',
		'Sync for now: node:sqlite is sync. A hub adapter would be the moment to revisit.',
		{
			parent: question.id,
		},
	)
	w.post(c, 'pod-viewer', 'coord.ack', 'Thanks, coding against sync.', { parent: question.id })
	store.markRead(c, 'council')
	w.post(
		c,
		'pod-store',
		'coord.handoff',
		'Store API pushed; the viewer can switch from its fixture to the real import.',
		{
			refs: ['gh:cyberuni/cynapse:feat/prototype-core'],
		},
	)
}

function seedFeed(w: World): void {
	const { store } = w
	store.createStream({
		handle: 'feed-cynapse',
		type: 'feed.changes',
		title: 'cyberuni/cynapse changes',
		purpose: 'Trunk moves, CI results and releases, for agents to react to.',
		author: 'git-watch',
		traits: { membership: 'open', wake: true, retention: '30d' },
	})
	const f = 'feed-cynapse'
	w.members(f, 'git-watch', [
		['git-watch', 'publisher'],
		['ci', 'publisher'],
		['operator', 'subscriber'],
		['pod-store', 'subscriber'],
		['council', 'subscriber'],
	])
	w.post(f, 'git-watch', 'feed.main.moved', 'main moved to 0c173b2: docs(research) (#14)', {
		refs: ['gh:cyberuni/cynapse@0c173b2', 'gh:cyberuni/cynapse#14'],
		data: { from: 'eb01016', to: '0c173b2' },
	})
	w.post(f, 'ci', 'feed.ci.failed', 'CI failed on feat/seq-order: knip found an unused export.', {
		refs: ['gh:cyberuni/cynapse#19'],
		data: { branch: 'feat/seq-order', job: 'verify' },
		tags: ['ci.lint'],
	})
	w.post(f, 'ci', 'feed.ci.passed', 'CI green on feat/seq-order.', {
		refs: ['gh:cyberuni/cynapse#19'],
		data: { branch: 'feat/seq-order' },
	})
	store.markRead(f, 'council')
	w.post(f, 'git-watch', 'feed.main.moved', 'main moved to 5d4e3f2: feat: assign seq under the write lock (#19)', {
		refs: ['gh:cyberuni/cynapse@5d4e3f2', 'gh:cyberuni/cynapse#19'],
		data: { from: '0c173b2', to: '5d4e3f2' },
	})
	w.post(f, 'ci', 'feed.ci.failed', 'CI failed on main: flaky load test timeout on the macOS runner.', {
		refs: ['gh:cyberuni/cynapse@5d4e3f2'],
		data: { branch: 'main', job: 'test' },
		tags: ['ci.flaky', 'council.attention'],
	})
}

function seedDm(w: World): void {
	const { store } = w
	store.createStream({
		handle: 'dm-council-conductor',
		type: 'cynapse.dm',
		title: 'Council ↔ SDD conductor',
		author: 'sdd-conductor',
		key: 'dm:council,sdd-conductor',
		traits: { membership: 'fixed', wake: true },
	})
	const d = 'dm-council-conductor'
	w.members(d, 'sdd-conductor', [
		['council', 'participant'],
		['sdd-conductor', 'participant'],
	])
	const waiting = store
		.states({ kind: 'needs-input', status: 'open', subject: 'council' })
		.map((state) => (state.entryId ? store.entry(state.entryId) : undefined))
		.filter((entry): entry is Entry => entry !== undefined)
		.map((entry) => `${entry.stream}#${entry.seq}`)
	w.post(
		d,
		'sdd-conductor',
		'cynapse.message',
		`${waiting.length} decisions are waiting on you: ${waiting.join(', ')}.`,
		{
			refs: waiting,
			tags: ['council.attention'],
		},
	)
}
