import type {
	WorkspaceSnapshot,
	WorkspaceSnapshotRow,
	WorkspaceStoreInterface,
} from '../../types.js'
import type { TableInterface } from '@orkestrel/database'
import { isWorkspaceSnapshot } from '../../validators.js'

/**
 * Persists workspace snapshots in a database table.
 *
 * Snapshots occupy one opaque column and are narrowed when read back from the storage boundary.
 *
 * @example
 * ```ts
 * import { rawShape, stringShape } from '@orkestrel/contract'
 * import { createDatabase, createMemoryDriver } from '@orkestrel/database'
 * import { DatabaseWorkspaceStore } from '@orkestrel/workspace'
 *
 * const database = createDatabase({
 * 	driver: createMemoryDriver(),
 * 	tables: { workspaces: { id: stringShape(), snapshot: rawShape({}) } },
 * })
 * const store = new DatabaseWorkspaceStore(database.table('workspaces'))
 * ```
 */
export class DatabaseWorkspaceStore implements WorkspaceStoreInterface {
	readonly #table: TableInterface<WorkspaceSnapshotRow>

	/**
	 * Wraps a workspace snapshot table.
	 *
	 * @param table - The table keyed by workspace identifier
	 */
	constructor(table: TableInterface<WorkspaceSnapshotRow>) {
		this.#table = table
	}

	async get(id: string): Promise<WorkspaceSnapshot | undefined> {
		const row = await this.#table.get(id)
		if (row === undefined) return undefined
		return isWorkspaceSnapshot(row.snapshot) ? row.snapshot : undefined
	}

	async set(snapshot: WorkspaceSnapshot): Promise<void> {
		await this.#table.set({ id: snapshot.id, snapshot })
	}

	async delete(id: string): Promise<void> {
		await this.#table.remove(id)
	}
}
