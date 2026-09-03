import type { WorkspaceSnapshot, WorkspaceStoreInterface } from '@src/core'
import { roundTripJSON } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import { buildWorkspaceSnapshot, WORKSPACE_STORE_CASES } from './setup.js'

// The subject is `tests/setup.ts`, the workspace's shared test infrastructure, and nothing it is
// built from. Production behavior is proven by the mirrored suites under `tests/src/`; every
// expectation here is a literal or a second route (a JSON round trip, a locally written store)
// that the module cannot share with the value it produces.
//
// `tests/setup.ts` is host-independent, so the `setup` project's Node environment reaches every
// contract it exports and no half of it is deferred to another project.

/**
 * A Map-backed store implementing the real persistence interface.
 *
 * The case table under test takes a store, so a conforming store is its input. This one is
 * written here rather than taken from `@src/core` so the table is not proven against the same
 * implementation the mirrored store suites already drive it with.
 */
class MapWorkspaceStore implements WorkspaceStoreInterface {
	readonly #snapshots = new Map<string, WorkspaceSnapshot>()

	get(id: string): Promise<WorkspaceSnapshot | undefined> {
		return Promise.resolve(this.#snapshots.get(id))
	}

	set(snapshot: WorkspaceSnapshot): Promise<void> {
		this.#snapshots.set(snapshot.id, snapshot)
		return Promise.resolve()
	}

	delete(id: string): Promise<void> {
		this.#snapshots.delete(id)
		return Promise.resolve()
	}
}

/** Every store a case asked for, in the order it asked. */
const seen: WorkspaceStoreInterface[] = []

/** Hand a case a conforming store and record which one it received. */
function createRecordedStore(): WorkspaceStoreInterface {
	const store = new MapWorkspaceStore()
	seen.push(store)
	return store
}

describe('buildWorkspaceSnapshot', () => {
	it('defaults its id to scratch and carries a supplied id through', () => {
		expect(buildWorkspaceSnapshot().id).toBe('scratch')
		expect(buildWorkspaceSnapshot('alpha').id).toBe('alpha')
	})

	it('carries the text file then the binary file, in the order the store cases assert', () => {
		const snapshot = buildWorkspaceSnapshot()
		const [text, binary] = snapshot.files

		expect(snapshot.files.map((file) => file.path)).toEqual(['src/main.ts', 'icon.png'])
		expect(text?.content).toHaveProperty('text', 'const x = 1')
		expect(binary?.content).toEqual({ base64: 'AAAA', mime: 'image/png' })
	})

	it('is pure JSON, which is what the driver-swap parity proofs rest on', () => {
		const snapshot = buildWorkspaceSnapshot('work')

		expect(roundTripJSON(snapshot)).toEqual(snapshot)
	})

	it('returns an independent value on each call, so no case can leak state into another', () => {
		const first = buildWorkspaceSnapshot('shared')
		const second = buildWorkspaceSnapshot('shared')

		expect(second).toEqual(first)
		expect(second).not.toBe(first)
		expect(second.files).not.toBe(first.files)
	})
})

// The table is its own proof: every case it carries runs here against a conforming store and the
// real snapshot builder, so a case that stopped observing reddens this file. The membership
// assertion comes first, so an emptied table reddens instead of running nothing.
describe('WORKSPACE_STORE_CASES', () => {
	it('carries the scenarios the store suites run, by name', () => {
		expect(WORKSPACE_STORE_CASES.map((scenario) => scenario.name)).toEqual([
			'round-trips text and binary files',
			'replaces a snapshot under the same id',
			'deletes present values and ignores absent ids',
			'keeps distinct ids independent',
		])
	})

	for (const scenario of WORKSPACE_STORE_CASES) {
		it(`${scenario.name}`, async () => {
			const { actual, expected } = await scenario.probe(
				createRecordedStore(),
				buildWorkspaceSnapshot,
			)

			expect(actual).toEqual(expected)
		})
	}

	it('took a fresh store for every case it carries', () => {
		// Registration order puts this case after the loop, so `seen` holds one entry per case the
		// table carries. No entry repeats, so no case inherited another case's state.
		expect(seen.length).toBe(WORKSPACE_STORE_CASES.length)
		expect(new Set(seen).size).toBe(seen.length)
	})
})
