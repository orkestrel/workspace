import type { WorkspaceSnapshot, WorkspaceStoreInterface } from '@src/core'
import { roundTripJSON } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import {
	assertWorkspaceStoreContract,
	buildWorkspaceSnapshot,
	createRevokedProxy,
	createThrowingGetterRecord,
} from './setup.js'

// The subject is `tests/setup.ts`, the workspace's shared test infrastructure, and nothing it is
// built from. Production behavior is proven by the mirrored suites under `tests/src/`; every
// expectation here is a literal or a second route (a property descriptor, a JSON round trip, a
// locally written store) that the module cannot share with the value it produces.
//
// `tests/setup.ts` is host-independent, so the `setup` project's Node environment reaches every
// contract it exports and no half of it is deferred to another project.

/**
 * A Map-backed store implementing the real persistence interface.
 *
 * The battery under test takes a store factory, so a conforming store is its input. This one is
 * written here rather than taken from `@src/core` so the battery is not proven against the same
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

/** Every store the battery asked for, in the order it asked. */
const seen: WorkspaceStoreInterface[] = []

/** Hand the battery a conforming store and record which one it received. */
function createRecordedStore(): WorkspaceStoreInterface {
	const store = new MapWorkspaceStore()
	seen.push(store)
	return store
}

/** Read a property through a trap-triggering path that returns `unknown` rather than `any`. */
function readProperty(source: object, property: string): unknown {
	return Reflect.get(source, property)
}

describe('createThrowingGetterRecord', () => {
	it('seats an own enumerable accessor that throws when the named property is read', () => {
		const record = createThrowingGetterRecord('path')
		const descriptor = Object.getOwnPropertyDescriptor(record, 'path')

		// A descriptor read and a `has` check reach the property without invoking the getter, so a
		// total guard can inspect the shape and still meet the throw on the value.
		expect(typeof descriptor?.get).toBe('function')
		expect(descriptor?.enumerable).toBe(true)
		expect(Object.keys(record)).toEqual(['path'])
		expect(Reflect.has(record, 'path')).toBe(true)
		expect(() => readProperty(record, 'path')).toThrow(Error)
	})

	it('leaves every other property absent, so a guard reading another key is unaffected', () => {
		const record = createThrowingGetterRecord('id')

		expect(Object.getOwnPropertyDescriptor(record, 'path')).toBeUndefined()
		expect(readProperty(record, 'path')).toBeUndefined()
	})
})

describe('createRevokedProxy', () => {
	it('returns an object-typed value whose every trapped operation throws a TypeError', () => {
		const proxy = createRevokedProxy()

		expect(typeof proxy).toBe('object')
		expect(() => readProperty(proxy, 'path')).toThrow(TypeError)
		expect(() => Reflect.has(proxy, 'path')).toThrow(TypeError)
		expect(() => Object.keys(proxy)).toThrow(TypeError)
	})
})

describe('buildWorkspaceSnapshot', () => {
	it('defaults its id to scratch and carries a supplied id through', () => {
		expect(buildWorkspaceSnapshot().id).toBe('scratch')
		expect(buildWorkspaceSnapshot('alpha').id).toBe('alpha')
	})

	it('carries the text file then the binary file, in the order the store battery asserts', () => {
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

// The registered battery is its own proof: every case it writes runs here against a conforming
// store and the real snapshot builder, so a battery that stopped asserting reddens this file.
assertWorkspaceStoreContract(createRecordedStore, buildWorkspaceSnapshot)

describe('assertWorkspaceStoreContract', () => {
	it('takes a fresh store for every case it registered', () => {
		// Registration order puts this case after the battery, so `seen` holds one entry per case
		// the battery ran. No entry repeats, so no case inherited another case's state.
		expect(seen.length).toBeGreaterThan(1)
		expect(new Set(seen).size).toBe(seen.length)
	})
})
