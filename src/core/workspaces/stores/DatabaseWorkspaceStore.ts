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
 * import { createDatabaseWorkspaceStore } from '@orkestrel/workspace'
 *
 * const store = createDatabaseWorkspaceStore()
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
