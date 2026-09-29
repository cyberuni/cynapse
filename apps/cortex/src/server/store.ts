// Chooses the store Cortex reads: the fixture, until the cynapse library is on trunk.
import { createFixtureStore } from '../core/fixture.ts'
import type { Store } from '../core/model.ts'

export function openCortexStore(): { store: Store; label: string } {
	return { store: createFixtureStore(), label: 'fixture' }
}
