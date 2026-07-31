import type { WorkspaceSnapshotRow } from '@src/core'
import type { TableInterface } from '@orkestrel/database'
import { createDatabaseWorkspaceStore, DatabaseWorkspaceStore } from '@src/core'
import { rawShape, stringShape } from '@orkestrel/contract'
import { createDatabase, createMemoryDriver } from '@orkestrel/database'
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

describe('DatabaseWorkspaceStore — invalid stored rows', () => {
	it('returns undefined for snapshots with invalid state or MIME literals', async () => {
		const database = createDatabase({
			driver: createMemoryDriver(),
			tables: { workspaces: { id: stringShape(), snapshot: rawShape({}) } },
		})
		const table: TableInterface<WorkspaceSnapshotRow> = database.table('workspaces')
		const store = new DatabaseWorkspaceStore(table)
		const invalidFiles = [
			{
				path: 'a.txt',
				content: { text: 'a', language: 'text' },
				state: 'archived',
				size: 1,
				lines: 1,
			},
			{
				path: 'a.txt',
				content: { text: 'a', language: 'text' },
				state: '',
				size: 1,
				lines: 1,
			},
			{
				path: 'a.txt',
				content: { text: 'a', language: 'text' },
				state: 'loaded',
				size: 1,
				lines: 1,
			},
			{
				path: 'a.txt',
				content: { text: 'a', language: 'text' },
				state: 'deleted',
				size: 1,
				lines: 1,
			},
			{
				path: 'a.bin',
				content: { data: 'AA==', mime: 'application/pdf' },
				state: 'created',
				size: 1,
				lines: 0,
			},
			{
				path: 'a.bin',
				content: { data: 'AA==', mime: 'arbitrary' },
				state: 'created',
				size: 1,
				lines: 0,
			},
		]

		for (const [index, file] of invalidFiles.entries()) {
			const id = `invalid-${index}`
			await table.set({ id, snapshot: { id, files: [file] } })
			expect(await store.get(id)).toBeUndefined()
		}
	})
})
