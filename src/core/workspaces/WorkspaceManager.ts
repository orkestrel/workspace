import type { EmitterErrorHandler, EmitterHooks } from '@orkestrel/emitter'
import type {
	WorkspaceEventMap,
	WorkspaceInterface,
	WorkspaceManagerInterface,
	WorkspaceManagerOptions,
	WorkspaceOptions,
	WorkspaceStoreInterface,
} from '../types.js'
import { isArray } from '@orkestrel/contract'
import { Workspace } from './Workspace.js'

/**
 * Provides an insertion-ordered workspace registry with an active selection.
 *
 * A supplied store adds lenient snapshot `open` and `save` operations. Event defaults flow into
 * workspaces created through the registry, while observability remains owned by each workspace.
 *
 * @example
 * ```ts
 * import { WorkspaceManager } from '@orkestrel/workspace'
 *
 * const manager = new WorkspaceManager()
 * const workspace = manager.add({ id: 'scratch' })
 * manager.active === workspace
 * ```
 */
export class WorkspaceManager implements WorkspaceManagerInterface {
	readonly #workspaces = new Map<string, WorkspaceInterface>()
	#active: string | undefined
	readonly #on: EmitterHooks<WorkspaceEventMap> | undefined
	readonly #error: EmitterErrorHandler | undefined
	readonly #store: WorkspaceStoreInterface | undefined

	/**
	 * Creates a registry.
	 *
	 * @param options - Default event hooks and optional snapshot store
	 */
	constructor(options?: WorkspaceManagerOptions) {
		this.#on = options?.on
		this.#error = options?.error
		this.#store = options?.store
	}

	get count(): number {
		return this.#workspaces.size
	}

	get active(): WorkspaceInterface | undefined {
		return this.#active === undefined ? undefined : this.#workspaces.get(this.#active)
	}

	workspace(id: string): WorkspaceInterface | undefined {
		return this.#workspaces.get(id)
	}

	workspaces(): readonly WorkspaceInterface[] {
		return [...this.#workspaces.values()]
	}

	add(options?: WorkspaceOptions): WorkspaceInterface {
		const on = options?.on ?? this.#on
		const error = options?.error ?? this.#error
		const workspace = new Workspace({
			...(options?.id === undefined ? {} : { id: options.id }),
			...(on === undefined ? {} : { on }),
			...(error === undefined ? {} : { error }),
			...(options?.seed === undefined ? {} : { seed: options.seed }),
		})
		this.#workspaces.set(workspace.id, workspace)
		if (this.#active === undefined) this.#active = workspace.id
		return workspace
	}

	switch(id: string): WorkspaceInterface | undefined {
		const workspace = this.#workspaces.get(id)
		if (workspace === undefined) return undefined
		this.#active = id
		return workspace
	}

	async open(id: string): Promise<WorkspaceInterface | undefined> {
		const existing = this.#workspaces.get(id)
		if (existing !== undefined) {
			this.#active = id
			return existing
		}
		if (this.#store === undefined) return undefined
		const snapshot = await this.#store.get(id)
		if (snapshot === undefined) return undefined
		const workspace = this.add({ id, seed: snapshot.files })
		this.#active = workspace.id
		return workspace
	}

	async save(id: string): Promise<boolean> {
		const workspace = this.#workspaces.get(id)
		if (this.#store === undefined || workspace === undefined) return false
		await this.#store.set(workspace.snapshot())
		return true
	}

	remove(id: string): boolean
	remove(ids: readonly string[]): boolean
	remove(ids: string | readonly string[]): boolean {
		if (isArray(ids)) {
			let removed = true
			for (const id of ids) {
				if (!this.#drop(id)) removed = false
			}
			return removed
		}
		return this.#drop(ids)
	}

	clear(): void {
		for (const workspace of this.#workspaces.values()) workspace.destroy()
		this.#workspaces.clear()
		this.#active = undefined
	}

	#drop(id: string): boolean {
		const workspace = this.#workspaces.get(id)
		if (workspace === undefined) return false
		this.#workspaces.delete(id)
		workspace.destroy()
		if (this.#active === id) this.#active = undefined
		return true
	}
}
