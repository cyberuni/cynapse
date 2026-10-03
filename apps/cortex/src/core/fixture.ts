// Demo data shaped like cynapse-core's `cynapse dev seed`: an SDD initiative → epic →
// mission hierarchy, an SDD mission graph, a cyber-truss mission whose arbitration
// escalates to the Council, a coordination channel, and a change feed.
import { createMemoryStore, type MemoryStore } from './memory-store.ts'
import { COUNCIL } from './model.ts'

export function createFixtureStore(): MemoryStore {
	const store = createMemoryStore({ now: () => new Date('2026-09-28T09:00:00Z') })
	for (const [id, kind, name] of [
		[COUNCIL, 'human', 'The Council'],
		['planner', 'agent', 'SDD planner'],
		['builder', 'agent', 'SDD builder'],
		['reviewer', 'agent', 'SDD reviewer'],
		['spec-writer', 'agent', 'truss spec writer'],
		['test-writer', 'agent', 'truss test writer'],
		['impl-writer', 'agent', 'truss impl writer'],
		['operator', 'agent', 'fleet operator'],
		['github', 'service', 'GitHub'],
	] as const) {
		store.addParticipant({ id, kind, name })
	}
	seedHierarchy(store)
	seedGraph(store)
	seedTruss(store)
	seedCoordination(store)
	return store
}

function seedHierarchy(store: MemoryStore) {
	store.createChannel({
		handle: 'init-identity',
		type: 'sdd.initiative',
		title: 'Identity platform',
		purpose: 'Replace session cookies with token-based identity across the fleet.',
		members: [
			{ participant: COUNCIL, role: 'owner' },
			{ participant: 'planner', role: 'planner' },
		],
		context: ['gh:cyberuni/cynapse#20'],
	})
	store.append('init-identity', {
		author: COUNCIL,
		type: 'sdd.initiative.opened',
		body: 'Open the identity platform initiative.',
	})
	const epics = [
		{ handle: 'epic-auth', title: 'Authentication', missions: ['m-login', 'm-token-refresh'] },
		{ handle: 'epic-audit', title: 'Audit trail', missions: ['m-audit-log'] },
	]
	const missionTitles: Record<string, string> = {
		'm-login': 'Login with tokens',
		'm-token-refresh': 'Token refresh',
		'm-audit-log': 'Audit log writer',
	}
	for (const epic of epics) {
		const anchor = store.append('init-identity', {
			author: 'planner',
			type: 'sdd.epic.opened',
			body: `Epic: ${epic.title}`,
		})
		store.createChannel({
			handle: epic.handle,
			type: 'sdd.epic',
			title: epic.title,
			anchor: `init-identity#${anchor.seq}`,
			members: [
				{ participant: COUNCIL, role: 'owner' },
				{ participant: 'planner', role: 'planner' },
			],
		})
		for (const mission of epic.missions) {
			const opened = store.append(epic.handle, {
				author: 'planner',
				type: 'sdd.mission.opened',
				body: `Mission: ${missionTitles[mission]}`,
			})
			store.createChannel({
				handle: mission,
				type: 'sdd.mission',
				title: missionTitles[mission] ?? mission,
				anchor: `${epic.handle}#${opened.seq}`,
				members: [
					{ participant: COUNCIL, role: 'owner' },
					{ participant: 'builder', role: 'builder' },
					{ participant: 'reviewer', role: 'reviewer' },
				],
				context: [`gh:cyberuni/cynapse#${30 + epic.missions.indexOf(mission)}`],
				conventions: ['sdd.mission-ledger'],
			})
			store.defineView(mission, {
				name: 'distilled',
				filter: { types: ['sdd.decision', 'sdd.outcome', 'cynapse.summary'] },
			})
		}
	}

	// A reconciled mission: a raw ledger with a distilled view over it.
	store.append('m-login', {
		author: 'builder',
		type: 'sdd.note',
		body: 'Explored the session middleware; three call sites read the cookie directly.',
		tags: ['topic:auth'],
		refs: ['gh:cyberuni/cynapse#31'],
	})
	store.append('m-login', {
		author: 'builder',
		type: 'sdd.note',
		body: 'Tried a shim in front of the cookie reader — too leaky, dropping it.',
		tags: ['topic:auth'],
	})
	const decision = store.append('m-login', {
		author: 'builder',
		type: 'sdd.decision',
		body: 'Issue short-lived access tokens (15 min) and rotate refresh tokens on use.',
		tags: ['topic:auth', 'decision:tokens'],
	})
	store.append('m-login', {
		author: 'reviewer',
		type: 'sdd.review',
		body: 'Agree. Make the rotation window configurable.',
		parent: decision.id,
	})
	store.append('m-login', {
		author: 'builder',
		type: 'sdd.note',
		body: 'Done — window is `AUTH_ROTATION_MS`.',
		parent: 'm-login#4',
	})
	store.append('m-login', {
		author: 'builder',
		type: 'sdd.outcome',
		body: 'Login issues tokens. Merged in gh:cyberuni/cynapse#34.',
		refs: ['gh:cyberuni/cynapse#34'],
		tags: ['topic:auth'],
	})
	store.pin('m-login', decision.seq)
	store.setLifecycle('m-login', 'reconciled', 'reviewer')
	store.markRead('m-login', COUNCIL, 3)

	// A mission that needs the Council.
	store.append('m-token-refresh', {
		author: 'builder',
		type: 'sdd.note',
		body: 'Refresh endpoint drafted. Open question on revocation.',
		tags: ['topic:auth'],
	})
	const ask = store.append('m-token-refresh', {
		author: 'builder',
		type: 'sdd.needs-input',
		body: 'Should a revoked refresh token revoke the whole family, or only itself?',
		tags: ['topic:auth'],
	})
	store.setState(
		'm-token-refresh',
		{ key: 'revocation', kind: 'needs-input', status: 'open', subject: COUNCIL, entryId: ask.id },
		'builder',
	)

	store.append('m-audit-log', {
		author: 'builder',
		type: 'sdd.note',
		body: 'Audit writer appends to the change feed; retention 90 days.',
		tags: ['topic:audit'],
		refs: ['changes#1'],
	})
}

function seedGraph(store: MemoryStore) {
	store.createChannel({
		handle: 'graph-identity',
		type: 'sdd.mission-graph',
		title: 'Identity mission graph',
		members: [
			{ participant: COUNCIL, role: 'owner' },
			{ participant: 'operator', role: 'dispatcher' },
		],
	})
	const node = (id: string, title: string, channel?: string) =>
		store.append('graph-identity', {
			author: 'planner',
			type: 'sdd.graph.node',
			body: title,
			data: { node: id, kind: 'mission', title, status: 'open', channel },
		})
	const edge = (from: string, to: string) =>
		store.append('graph-identity', {
			author: 'planner',
			type: 'sdd.graph.edge',
			body: `${from} → ${to}`,
			data: { from, to, kind: 'RAW' },
		})
	const frontier = (ready: string[], whyReady: Record<string, string>) =>
		store.append('graph-identity', {
			author: 'operator',
			type: 'sdd.graph.frontier',
			body: `ready: ${ready.join(', ') || '(none)'}`,
			data: { ready, whyReady },
		})
	node('login', 'Login with tokens', 'm-login')
	node('refresh', 'Token refresh', 'm-token-refresh')
	node('audit', 'Audit log writer', 'm-audit-log')
	node('revocation', 'Revocation list')
	node('sso', 'Single sign-on')
	edge('login', 'refresh')
	edge('login', 'audit')
	edge('refresh', 'revocation')
	edge('audit', 'sso')
	edge('revocation', 'sso')
	frontier(['login'], { login: 'no RAW predecessors' })
	store.append('graph-identity', {
		author: 'operator',
		type: 'sdd.graph.claim',
		body: 'builder claims login',
		data: { node: 'login', by: 'builder' },
	})
	store.append('graph-identity', {
		author: 'operator',
		type: 'sdd.graph.retire',
		body: 'login retired: merged',
		data: { node: 'login', outcome: 'merged' },
	})
	frontier(['refresh', 'audit'], {
		refresh: 'RAW predecessor login retired',
		audit: 'RAW predecessor login retired',
		revocation: 'held: RAW predecessor refresh not retired',
	})
	store.append('graph-identity', {
		author: 'operator',
		type: 'sdd.graph.claim',
		body: 'builder claims refresh',
		data: { node: 'refresh', by: 'builder' },
	})
}

function seedTruss(store: MemoryStore) {
	const electorate = ['spec-writer', 'test-writer', 'impl-writer']
	store.createChannel({
		handle: 'truss-auth',
		type: 'truss.mission',
		title: 'Propagate token auth across artifacts',
		purpose: 'Carry the token-auth change through spec, tests, and implementation.',
		members: [
			{ participant: COUNCIL, role: 'owner' },
			...electorate.map((p) => ({ participant: p, role: 'workflow' })),
		],
		context: ['gh:cyberuni/cynapse#40', 'm-login#3'],
	})
	const contribution = (author: string, artifact: string, body: string) =>
		store.append('truss-auth', {
			author,
			type: 'truss.contribution',
			body,
			tags: ['topic:auth', `artifact:${artifact}`],
			data: {
				set: artifact,
				artifacts: [`${artifact}/auth.md`],
				workflow: 'token-auth',
				provenance: { from: 'm-login#3' },
			},
		})
	contribution('spec-writer', 'spec', 'Spec: tokens expire after 15 minutes; refresh rotates.')
	contribution('test-writer', 'tests', 'Tests assert a 15-minute expiry and single-use refresh tokens.')
	contribution('impl-writer', 'impl', 'Impl keeps a 60-minute expiry for legacy clients.')

	// A settled arbitration: anchor → child channel → decision written back.
	const settled = store.append('truss-auth', {
		author: 'test-writer',
		type: 'truss.arbitration-needed',
		body: 'Does refresh rotation apply to legacy clients?',
		refs: ['truss-auth#1', 'truss-auth#2'],
	})
	store.createChannel({
		handle: 'arb-auth-rotation',
		type: 'truss.arbitration',
		title: 'Rotation for legacy clients',
		anchor: `truss-auth#${settled.seq}`,
		members: electorate.map((p) => ({ participant: p, role: 'elector' })),
	})
	store.append('arb-auth-rotation', {
		author: 'spec-writer',
		type: 'truss.answer.agree',
		body: 'Rotation applies to every client.',
		refs: ['truss-auth#1'],
	})
	store.append('arb-auth-rotation', {
		author: 'test-writer',
		type: 'truss.answer.agree',
		body: 'Tests already assume it.',
		refs: ['truss-auth#2'],
	})
	store.append('arb-auth-rotation', {
		author: 'impl-writer',
		type: 'truss.answer.yield',
		body: 'Uncontested — yielding.',
	})
	store.setState(
		'arb-auth-rotation',
		{ key: 'answers', kind: 'pending-answers', status: 'resolved', value: { waiting: [] } },
		'spec-writer',
	)
	store.setLifecycle('arb-auth-rotation', 'closed', 'spec-writer')
	store.append('truss-auth', {
		author: 'spec-writer',
		type: 'truss.decision',
		body: 'Rotation applies to all clients, legacy included.',
		parent: settled.id,
		refs: ['arb-auth-rotation#1', 'arb-auth-rotation#2', 'arb-auth-rotation#3'],
		tags: ['topic:auth'],
		data: { outcome: 'agree', arbitration: 'arb-auth-rotation' },
	})

	// An open arbitration that has escalated to the Council.
	const open = store.append('truss-auth', {
		author: 'impl-writer',
		type: 'truss.arbitration-needed',
		body: 'Token expiry: 15 minutes (spec, tests) or 60 minutes (impl)?',
		refs: ['truss-auth#1', 'truss-auth#2', 'truss-auth#3'],
		tags: ['topic:auth'],
	})
	store.createChannel({
		handle: 'arb-auth-expiry',
		type: 'truss.arbitration',
		title: 'Token expiry',
		anchor: `truss-auth#${open.seq}`,
		members: [
			{ participant: COUNCIL, role: 'arbiter' },
			...electorate.map((p) => ({ participant: p, role: 'elector' })),
		],
	})
	store.append('arb-auth-expiry', {
		author: 'spec-writer',
		type: 'truss.answer.agree',
		body: '15 minutes — the spec is explicit.',
		refs: ['truss-auth#1'],
	})
	store.append('arb-auth-expiry', {
		author: 'impl-writer',
		type: 'truss.answer.disagree',
		body: 'Legacy clients cannot refresh that often; 60 minutes.',
		refs: ['truss-auth#3'],
	})
	store.setState(
		'arb-auth-expiry',
		{ key: 'answers', kind: 'pending-answers', status: 'open', value: { waiting: ['test-writer'] } },
		'spec-writer',
	)
	store.setLifecycle('arb-auth-expiry', 'escalated', 'spec-writer')
	const escalation = store.append('arb-auth-expiry', {
		author: 'spec-writer',
		type: 'truss.escalation',
		body: 'Deadlocked 1–1 with test-writer silent. Council: which expiry?',
		tags: ['topic:auth'],
	})
	store.setState(
		'arb-auth-expiry',
		{
			key: 'escalation',
			kind: 'needs-input',
			status: 'open',
			subject: COUNCIL,
			entryId: escalation.id,
			value: { question: 'Token expiry?', options: ['15 minutes', '60 minutes'] },
		},
		'spec-writer',
	)
}

function seedCoordination(store: MemoryStore) {
	store.createChannel({
		handle: 'coord',
		type: 'coord.channel',
		title: 'Fleet coordination',
		members: [
			{ participant: COUNCIL, role: 'observer' },
			{ participant: 'operator', role: 'dispatcher' },
			{ participant: 'builder', role: 'agent' },
		],
	})
	store.append('coord', { author: 'operator', type: 'coord.message', body: 'builder: take refresh next.' })
	store.append('coord', {
		author: 'builder',
		type: 'coord.lease',
		body: 'Leasing src/auth/** for 30 min.',
		data: { paths: ['src/auth/**'], ttl: 1800, exclusive: true },
	})
	store.setState(
		'coord',
		{ key: 'lease:src/auth', kind: 'lease', status: 'open', subject: 'builder', value: { paths: ['src/auth/**'] } },
		'builder',
	)
	store.append('coord', {
		author: 'builder',
		type: 'coord.message',
		body: 'Waiting on the Council for revocation semantics.',
	})

	store.createChannel({
		handle: 'changes',
		type: 'feed.changes',
		title: 'Change feed',
		members: [{ participant: COUNCIL, role: 'observer' }],
	})
	store.append('changes', {
		author: 'github',
		type: 'feed.change',
		body: 'PR merged: token login.',
		refs: ['gh:cyberuni/cynapse#34'],
	})
	store.append('changes', {
		author: 'github',
		type: 'feed.change',
		body: 'Issue opened: revocation semantics.',
		refs: ['gh:cyberuni/cynapse#41'],
	})
}
