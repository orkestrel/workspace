import { createMemoryWorkspaceStore, isWorkspaceSnapshot } from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	assertWorkspaceStoreContract,
	buildWorkspaceSnapshot,
	roundTripJSON,
} from '../../../../setup.js'

// The W-d MemoryWorkspaceStore — the in-memory default behind the WorkspaceStoreInterface
// persistence seam (get / set / delete, async, keyed by a snapshot's own id). It persists the
// WorkspaceSnapshot (the self-contained, pure-JSON workspace state) UNCHANGED. REAL data only
// (AGENTS §16) — a real Workspace's `snapshot()` carrying BOTH a text file (minted by the edit
// surface) and a BINARY file (seated through `createFile`, the only way to seat a non-text file),
// NO mocks.

// The shared `WorkspaceStoreInterface` contract battery (round-trip / upsert / delete & absent /
// two-ids-coexist) plus the real `buildWorkspaceSnapshot` fixture both store twins drive live in
// tests/setup.ts (AGENTS §16.1), so the contract + snapshot stay in ONE place. This file invokes
// that battery against the memory factory and keeps only its TWIN-SPECIFIC blocks below: the JSON
// driver-swap-parity round-trip and the `isWorkspaceSnapshot` read-boundary guard.
describe('MemoryWorkspaceStore', () => {
	assertWorkspaceStoreContract(() => createMemoryWorkspaceStore(), buildWorkspaceSnapshot)
})

describe('MemoryWorkspaceStore — JSON driver-swap parity', () => {
	it('the retrieved snapshot survives JSON.stringify/parse identically (driver-swap parity)', async () => {
		// After `set`, the retrieved payload must survive a full JSON round-trip — proving it persists
		// unchanged across ANY JSON / SQLite / IndexedDB backend (the real driver-swap guarantee).
		const store = createMemoryWorkspaceStore()
		const snapshot = buildWorkspaceSnapshot()

		await store.set(snapshot)
		const got = await store.get(snapshot.id)
		expect(got).toBeDefined()
		if (got === undefined) return
		expect(roundTripJSON(got)).toEqual(got)
	})
})

describe('isWorkspaceSnapshot — the §14 read-boundary guard (total + defensive)', () => {
	it('accepts a real snapshot (text + binary files)', () => {
		expect(isWorkspaceSnapshot(buildWorkspaceSnapshot())).toBe(true)
		// An empty-files snapshot is still valid (a fresh workspace).
		expect(isWorkspaceSnapshot({ id: 'w', files: [] })).toBe(true)
	})

	it('rejects malformed input without throwing (total guard)', () => {
		// Non-records / primitives / nullish.
		expect(isWorkspaceSnapshot(undefined)).toBe(false)
		expect(isWorkspaceSnapshot(null)).toBe(false)
		expect(isWorkspaceSnapshot(42)).toBe(false)
		expect(isWorkspaceSnapshot('snapshot')).toBe(false)
		// Missing / wrong-typed `id`.
		expect(isWorkspaceSnapshot({ files: [] })).toBe(false)
		expect(isWorkspaceSnapshot({ id: 1, files: [] })).toBe(false)
		// `files` not an array.
		expect(isWorkspaceSnapshot({ id: 'w', files: 'nope' })).toBe(false)
		expect(isWorkspaceSnapshot({ id: 'w', files: { a: 1 } })).toBe(false)
		// `files` carries a malformed file element (missing content / size / lines).
		expect(isWorkspaceSnapshot({ id: 'w', files: [{ path: 'a.ts' }] })).toBe(false)
		// A file whose content is neither a text arm nor a binary arm.
		expect(
			isWorkspaceSnapshot({
				id: 'w',
				files: [{ path: 'a', content: { other: 1 }, state: 'created', size: 0, lines: 0 }],
			}),
		).toBe(false)
	})

	it('accepts a snapshot revived from JSON (the storage-read shape the DB store narrows)', () => {
		// The exact value a DatabaseWorkspaceStore reads back from its opaque JSON column — a plain
		// object the guard must accept structurally (no class instances required).
		const revived = roundTripJSON(buildWorkspaceSnapshot())
		expect(isWorkspaceSnapshot(revived)).toBe(true)
	})
})
