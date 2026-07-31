import type { EmitterErrorHandler, EmitterHooks, EmitterInterface } from '@orkestrel/emitter'

/**
 * The binary MIME labels supported by a binary {@link FileContent} arm.
 *
 * Image-consuming callers can use {@link import('./helpers.js').isImage} to recognize image MIME
 * labels without coupling the workspace to a renderer.
 */
export type BinaryMIME = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

/**
 * The immutable content of a file: either text with a language tag or base64 data with a MIME.
 */
export type FileContent =
	| { readonly text: string; readonly language: string }
	| { readonly data: string; readonly mime: BinaryMIME }

/** The lifecycle state of an immutable file value. */
export type FileState = 'created' | 'modified' | 'loaded' | 'deleted'

/** The caller-supplied data used to create an immutable file. */
export interface FileInput {
	readonly path: string
	readonly content: FileContent
	readonly state?: FileState
}

/** An immutable path-addressed file with derived byte and line counts. */
export interface FileInterface {
	readonly path: string
	readonly content: FileContent
	readonly state: FileState
	readonly size: number
	readonly lines: number
}

/** A 1-based caret position inside text. */
export interface Position {
	readonly line: number
	readonly column: number
}

/** A half-open text span whose start is inclusive and end is exclusive. */
export interface Range {
	readonly start: Position
	readonly end: Position
}

/** The content and clamped span returned by a ranged read. */
export interface ReadResult {
	readonly content: string
	readonly range: Range
}

/**
 * Search behavior.
 *
 * @remarks
 * `regex` treats the query as regular-expression source, `exact` controls case sensitivity, and
 * `limit` caps the result count.
 */
export interface SearchOptions {
	readonly regex?: boolean
	readonly exact?: boolean
	readonly limit?: number
}

/** One 1-based search hit and the full line that contains it. */
export interface SearchMatch {
	readonly path: string
	readonly line: number
	readonly column: number
	readonly length: number
	readonly content: string
}

/**
 * Replacement behavior.
 *
 * @remarks
 * `regex` treats the query as regular-expression source, `exact` controls case sensitivity, and
 * `limit` caps the replacement count.
 */
export interface ReplaceOptions {
	readonly regex?: boolean
	readonly exact?: boolean
	readonly limit?: number
}

/** The query and tallies produced by a replacement operation. */
export interface ReplaceResult {
	readonly query: string
	readonly replaced: number
	readonly files: number
}

/** Events emitted after workspace mutations complete. */
export type WorkspaceEventMap = {
	readonly write: readonly [file: FileInterface]
	readonly remove: readonly [path: string]
	readonly move: readonly [move: { readonly from: string; readonly to: string }]
	readonly clear: readonly []
}

/**
 * Workspace construction options.
 *
 * @remarks
 * `id` supplies the registry key, `on` supplies initial event listeners, and `error` receives
 * isolated listener failures.
 */
export interface WorkspaceOptions {
	readonly id?: string
	readonly on?: EmitterHooks<WorkspaceEventMap>
	readonly error?: EmitterErrorHandler
}

/** A JSON-serializable workspace snapshot. */
export interface WorkspaceSnapshot {
	readonly id: string
	readonly files: readonly FileInterface[]
}

/** The asynchronous point-access persistence contract for workspace snapshots. */
export interface WorkspaceStoreInterface {
	/**
	 * Resolve a snapshot.
	 *
	 * @param id - The workspace identifier
	 * @returns The snapshot, or `undefined` when absent
	 */
	get(id: string): Promise<WorkspaceSnapshot | undefined>
	/**
	 * Insert or replace a snapshot under its own identifier.
	 *
	 * @param snapshot - The snapshot to persist
	 * @returns A promise that resolves when persistence completes
	 */
	set(snapshot: WorkspaceSnapshot): Promise<void>
	/**
	 * Delete a snapshot when present.
	 *
	 * @param id - The workspace identifier
	 * @returns A promise that resolves when deletion completes
	 */
	delete(id: string): Promise<void>
}

/** The database row used to persist one opaque workspace snapshot. */
export interface WorkspaceSnapshotRow {
	readonly id: string
	readonly snapshot: unknown
}

/** The machine-readable failure codes raised by the workspace edit surface. */
export type WorkspaceErrorCode = 'MODALITY' | 'PATTERN' | 'RANGE'

/** A mutable path-keyed editing surface over immutable file values. */
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
	replace(query: string, replacement: string, options?: ReplaceOptions): ReplaceResult
	write(path: string, content: string): void
	write(path: string, content: string, range: Range): void
	write(files: Readonly<Record<string, string>>): void
	prepend(path: string, content: string): void
	prepend(files: Readonly<Record<string, string>>): void
	append(path: string, content: string): void
	append(files: Readonly<Record<string, string>>): void
	move(from: string, to: string): boolean
	move(mapping: Readonly<Record<string, string>>): boolean
	remove(): void
	remove(path: string): boolean
	remove(paths: readonly string[]): boolean
	clear(): void
	snapshot(): WorkspaceSnapshot
}

/**
 * Workspace construction data accepted by a {@link WorkspaceManagerInterface}.
 *
 * `seed` hydrates initial immutable files without emitting edits.
 */
export interface WorkspaceInput {
	readonly id?: string
	readonly on?: EmitterHooks<WorkspaceEventMap>
	readonly error?: EmitterErrorHandler
	readonly seed?: Iterable<readonly [string, FileInterface]>
}

/**
 * Workspace-manager construction options.
 *
 * `on` and `error` become defaults for created workspaces; `store` supplies optional durability.
 */
export interface WorkspaceManagerOptions {
	readonly on?: EmitterHooks<WorkspaceEventMap>
	readonly error?: EmitterErrorHandler
	readonly store?: WorkspaceStoreInterface
}

/** An insertion-ordered workspace registry with an active selection and optional durability. */
export interface WorkspaceManagerInterface {
	readonly count: number
	readonly active: WorkspaceInterface | undefined
	workspace(id: string): WorkspaceInterface | undefined
	workspaces(): readonly WorkspaceInterface[]
	add(input?: WorkspaceInput): WorkspaceInterface
	switch(id: string): WorkspaceInterface | undefined
	open(id: string): Promise<WorkspaceInterface | undefined>
	save(id: string): Promise<boolean>
	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	clear(): void
}
