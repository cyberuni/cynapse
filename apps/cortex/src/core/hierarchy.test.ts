import { describe, expect, it } from 'vitest'
import { createFixtureStore } from './fixture.ts'
import { hierarchy, type TreeNode } from './hierarchy.ts'

const find = (nodes: TreeNode[], handle: string): TreeNode | undefined => {
	for (const node of nodes) {
		if (node.handle === handle) return node
		const found = find(node.children, handle)
		if (found) return found
	}
	return undefined
}

describe('hierarchy', () => {
	it('nests streams under the stream their anchor sits in', () => {
		const tree = hierarchy(createFixtureStore(), 'council')
		const initiative = find(tree, 'init-identity')
		expect(initiative?.children.map((c) => c.handle)).toEqual(['epic-auth', 'epic-audit'])
		expect(find(tree, 'epic-auth')?.children.map((c) => c.handle)).toEqual(['m-login', 'm-token-refresh'])
		expect(find(tree, 'm-login')?.anchor).toBe('epic-auth#1')
	})

	it('rolls up unread, needs-input and lifecycle from the subtree', () => {
		const tree = hierarchy(createFixtureStore(), 'council')
		const epic = find(tree, 'epic-auth')
		const login = find(tree, 'm-login')
		const refresh = find(tree, 'm-token-refresh')
		expect(epic?.rollup.unread).toBe((epic?.unread ?? 0) + (login?.unread ?? 0) + (refresh?.unread ?? 0))
		expect(epic?.rollup.needsInput).toBe(1)
		expect(epic?.rollup.lifecycle).toEqual({ active: 2, reconciled: 1 })
	})

	it('keeps streams without an anchor as roots', () => {
		const roots = hierarchy(createFixtureStore(), 'council').map((n) => n.handle)
		expect(roots).toEqual(expect.arrayContaining(['init-identity', 'truss-auth', 'coord', 'changes']))
		expect(roots).not.toContain('arb-auth-expiry')
	})
})
