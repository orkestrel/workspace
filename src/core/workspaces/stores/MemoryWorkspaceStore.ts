import type { WorkspaceSnapshot, WorkspaceStoreInterface } from '../../types.js'

/**
 * Holds workspace snapshots in the current process.
 *
 * @example
 * ```ts
 * import { MemoryWorkspaceStore } from '@orkestrel/workspace'
 *
 * const store = new MemoryWorkspaceStore()
 * ```
 */
export class MemoryWorkspaceStore implements WorkspaceStoreInterface {
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
