import type { EmitterErrorHandler, EmitterHooks, EmitterInterface } from '@orkestrel/emitter'

/** Names the MIME labels a binary {@link FileContent} arm supports. */
export type BinaryMIME = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

/**
 * Holds a file's immutable content: either text with a language tag or a base64 string with a
 * MIME.
 */
export type FileContent =
	| { readonly text: string; readonly language: string }
	| { readonly base64: string; readonly mime: BinaryMIME }

/** Names the edit state of an immutable file value. */
export type FileState = 'created' | 'modified'

/** Carries the caller-supplied values used to create an immutable file. */
export interface FileInput {
	readonly path: string
	readonly content: FileContent
	readonly state?: FileState
}

/** Represents an immutable path-addressed file with derived byte and line counts. */
export interface FileInterface {
	readonly path: string
	readonly content: FileContent
	readonly state: FileState
	readonly size: number
	readonly lines: number
}

/** Locates a 1-based caret inside text. */
export interface Position {
	readonly line: number
	readonly column: number
}

/** Represents a half-open text span whose start is inclusive and end is exclusive. */
export interface Range {
	readonly start: Position
	readonly end: Position
}

/** Carries the content and clamped span returned by a ranged read. */
export interface ReadResult {
	readonly content: string
	readonly range: Range
}

/**
 * Configures search and replacement behavior.
 *
 * @remarks
 * `regex` treats the query as regular-expression source, `sensitive` controls case sensitivity,
 * and `limit` caps the search or replacement count.
 */
export interface SearchOptions {
	readonly regex?: boolean
	readonly sensitive?: boolean
	readonly limit?: number
}

/** Reports one 1-based search hit and the full line that contains it. */
export interface SearchMatch {
	readonly path: string
	readonly line: number
	readonly column: number
	readonly length: number
	readonly content: string
}

/** Carries the tallies produced by a replacement operation. */
export interface ReplaceResult {
	readonly occurrences: number
	readonly files: number
}

/** Names the events emitted after workspace mutations complete. */
export type WorkspaceEventMap = {
	readonly write: readonly [file: FileInterface]
	readonly remove: readonly [path: string]
	readonly move: readonly [from: string, to: string]
	readonly clear: readonly []
}

/**
 * Configures a workspace at construction.
 *
 * @remarks
 * `id` supplies the registry key, `on` supplies initial event listeners, `error` receives isolated
 * listener failures, and `seed` hydrates initial immutable files without emitting edits.
 */
export interface WorkspaceOptions {
	readonly id?: string
	readonly on?: EmitterHooks<WorkspaceEventMap>
	readonly error?: EmitterErrorHandler
	readonly seed?: Iterable<FileInterface>
}

/** Represents a workspace's stored state in JSON-serializable form. */
export interface WorkspaceSnapshot {
	readonly id: string
	readonly files: readonly FileInterface[]
}

/** Persists workspace snapshots through an asynchronous point-access contract. */
export interface WorkspaceStoreInterface {
	/**
	 * Resolves a snapshot.
	 *
	 * @param id - The workspace identifier
	 * @returns The snapshot, or `undefined` when absent
	 */
	get(id: string): Promise<WorkspaceSnapshot | undefined>
	/**
	 * Inserts or replaces a snapshot under its own identifier.
	 *
	 * @param snapshot - The snapshot to persist
	 * @returns A promise that resolves when persistence completes
	 */
	set(snapshot: WorkspaceSnapshot): Promise<void>
	/**
	 * Deletes a snapshot when present.
	 *
	 * @param id - The workspace identifier
	 * @returns A promise that resolves when deletion completes
	 */
	delete(id: string): Promise<void>
}

/** Represents the database row used to persist one opaque workspace snapshot. */
export interface WorkspaceSnapshotRow {
	readonly id: string
	readonly snapshot: unknown
}

/** Names the machine-readable failure codes raised by the workspace edit surface. */
export type WorkspaceErrorCode = 'MODALITY' | 'PATTERN' | 'RANGE'

/** Represents a mutable path-keyed editing surface over immutable file values. */
export interface WorkspaceInterface {
	readonly id: string
	readonly emitter: EmitterInterface<WorkspaceEventMap>
	readonly count: number
	file(path: string): FileInterface | undefined
	files(): readonly FileInterface[]
	read(path: string): string | undefined
	read(path: string, range: Range): ReadResult | undefined
	read(paths: readonly string[]): Readonly<Record<string, string>>
	has(path: string): boolean
	has(paths: readonly string[]): boolean
	search(query: string, options?: SearchOptions): readonly SearchMatch[]
	replace(query: string, replacement: string, options?: SearchOptions): ReplaceResult
	write(path: string, content: string): void
	write(path: string, content: string, range: Range): void
	write(files: Readonly<Record<string, string>>): void
	prepend(path: string, content: string): void
	prepend(files: Readonly<Record<string, string>>): void
	append(path: string, content: string): void
	append(files: Readonly<Record<string, string>>): void
	move(from: string, to: string): boolean
	move(mapping: Readonly<Record<string, string>>): boolean
	remove(path: string): boolean
	remove(paths: readonly string[]): boolean
	clear(): void
	snapshot(): WorkspaceSnapshot
	destroy(): void
}

/**
 * Configures a workspace registry at construction.
 *
 * `on` and `error` become defaults for created workspaces; `store` supplies optional durability.
 */
export interface WorkspaceManagerOptions {
	readonly on?: EmitterHooks<WorkspaceEventMap>
	readonly error?: EmitterErrorHandler
	readonly store?: WorkspaceStoreInterface
}

/**
 * Represents an insertion-ordered workspace registry with an active selection and optional
 * durability.
 */
export interface WorkspaceManagerInterface {
	readonly count: number
	readonly active: WorkspaceInterface | undefined
	workspace(id: string): WorkspaceInterface | undefined
	workspaces(): readonly WorkspaceInterface[]
	add(options?: WorkspaceOptions): WorkspaceInterface
	switch(id: string): WorkspaceInterface | undefined
	open(id: string): Promise<WorkspaceInterface | undefined>
	save(id: string): Promise<boolean>
	remove(id: string): boolean
	remove(ids: readonly string[]): boolean
	clear(): void
}
