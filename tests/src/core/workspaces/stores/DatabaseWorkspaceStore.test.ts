import { createDatabaseWorkspaceStore } from '@src/core'
import { createMemoryDriver } from '@orkestrel/database'
import { describe, expect, it } from 'vitest'
import { assertWorkspaceStoreContract, buildWorkspaceSnapshot } from '../../../../setup.js'

// src/core/agents/workspaces/stores/DatabaseWorkspaceStore.ts — the durable, driver-pluggable twin
// of the plain-Map MemoryWorkspaceStore behind the WorkspaceStoreInterface seam (get / set / delete,
// async, keyed by a snapshot's own id). It persists the WorkspaceSnapshot as ONE OPAQUE JSON column
// over a `databases` table (driver default = createMemoryDriver), narrowing the column back to a
// WorkspaceSnapshot on `get` (the §14 boundary narrow). Exercised over a REAL memory driver, with
// REAL WorkspaceSnapshot values (§16 NO mocks) — a real Workspace's text file (minted by the edit
// surface) plus a BINARY file (the only way to seat one is `createFile`).

// The shared `WorkspaceStoreInterface` contract battery (round-trip / upsert / delete & absent /
// two-ids-coexist) plus the real `buildWorkspaceSnapshot` fixture both store twins drive live in
// tests/setup.ts (AGENTS §16.1). This file invokes that battery against the database factory (over a
// REAL memory driver) and keeps only its TWIN-SPECIFIC block below: the default-driver overload.
describe('DatabaseWorkspaceStore', () => {
	assertWorkspaceStoreContract(
		() => createDatabaseWorkspaceStore(createMemoryDriver()),
		buildWorkspaceSnapshot,
	)
})

describe('DatabaseWorkspaceStore — driver overload', () => {
	it('the same store works over the default memory driver (no explicit driver)', async () => {
		// The default-driver factory overload (no arg) builds an equivalent memory-backed store, so
		// the same set → get round-trip holds — the WorkspaceStoreInterface seam is driver-agnostic.
		const store = createDatabaseWorkspaceStore() // driver defaults to createMemoryDriver()
		const snapshot = buildWorkspaceSnapshot()

		await store.set(snapshot)
		expect(await store.get(snapshot.id)).toEqual(snapshot)
	})
})
