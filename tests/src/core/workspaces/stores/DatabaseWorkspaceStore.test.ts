import type { WorkspaceSnapshotRow } from '@src/core'
import type { TableInterface } from '@orkestrel/database'
import { createDatabaseWorkspaceStore, DatabaseWorkspaceStore } from '@src/core'
import { rawShape, stringShape } from '@orkestrel/contract'
import { createDatabase, createMemoryDriver } from '@orkestrel/database'
import { describe, expect, it } from 'vitest'
import { buildWorkspaceSnapshot, WORKSPACE_STORE_CASES } from '../../../../setup.js'

// src/core/workspaces/stores/DatabaseWorkspaceStore.ts — the durable, driver-pluggable twin
// of the plain-Map MemoryWorkspaceStore behind the WorkspaceStoreInterface seam (get / set / delete,
// async, keyed by a snapshot's own id). It persists the WorkspaceSnapshot as ONE OPAQUE JSON column
// over a `workspaces` table (driver default = createMemoryDriver), narrowing the column back to a
// WorkspaceSnapshot on `get` (the boundary narrow). Exercised over a REAL memory driver, with
// REAL WorkspaceSnapshot values — real data, no mocks — a real Workspace's text file (minted by the
// edit surface) plus a BINARY file (the only way to seat one is `createFile`).

// The shared `WorkspaceStoreInterface` contract cases (round-trip / upsert / delete & absent /
// two-ids-coexist) plus the real `buildWorkspaceSnapshot` fixture drive MemoryWorkspaceStore and
// DatabaseWorkspaceStore alike: the shared battery lives in tests/setup.ts. This file runs those
// cases against the database factory
// (over a REAL memory driver) and keeps only its TWIN-SPECIFIC block: the default-driver overload.
describe('DatabaseWorkspaceStore', () => {
	for (const scenario of WORKSPACE_STORE_CASES) {
		it(`${scenario.name}`, async () => {
			const { actual, expected } = await scenario.probe(
				createDatabaseWorkspaceStore(createMemoryDriver()),
				buildWorkspaceSnapshot,
			)

			expect(actual).toEqual(expected)
		})
	}
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
				content: { base64: 'AA==', mime: 'application/pdf' },
				state: 'created',
				size: 1,
				lines: 0,
			},
			{
				path: 'a.bin',
				content: { base64: 'AA==', mime: 'arbitrary' },
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
