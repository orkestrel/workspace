import type { EmitterErrorHandler, EmitterHooks, EmitterInterface } from '@orkestrel/emitter'

/** Names the MIME labels a binary {@link FileContent} arm supports. */
export type BinaryMIME = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

/** Holds the text arm of a file's immutable content: a body and its language tag. */
export interface TextContent {
	readonly text: string
	readonly language: string
}

/** Holds the binary arm of a file's immutable content: a base64 payload and its MIME. */
export interface BinaryContent {
	readonly base64: string
	readonly mime: BinaryMIME
}

/**
 * Holds a file's immutable content: either text with a language tag or a base64 string with a
 * MIME.
 */
export type FileContent = TextContent | BinaryContent

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
 * If `regex` is `true`, the query is treated as regular-expression source; if `false`, it is
 * escaped and matched literally. Default: `false`. If `sensitive` is `false`, matching ignores
 * case; if `true`, it does not. Default: `true`. `limit` caps the search or replacement count.
 * Default: unlimited.
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
 * `id` supplies the registry key. Default: a minted UUID. `on` supplies initial event listeners,
 * `error` receives isolated listener failures, and `seed` hydrates initial immutable files without
 * emitting edits.
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
export type WorkspaceErrorCode = 'MISSING' | 'MODALITY' | 'PATTERN' | 'RANGE'

/** Represents a mutable path-keyed editing surface over immutable file values. */
export interface WorkspaceInterface {
	/** Reports the registry key, either supplied at construction or minted. */
	readonly id: string
	/** Reports the owned emitter that publishes every settled mutation. */
	readonly emitter: EmitterInterface<WorkspaceEventMap>
	/** Reports how many files the map holds. */
	readonly count: number
	/**
	 * Finds the file value stored at one path.
	 *
	 * @param path - The path to look up
	 * @returns The frozen file value, or `undefined` when the path is absent
	 */
	file(path: string): FileInterface | undefined
	/**
	 * Lists every file in insertion order.
	 *
	 * @returns A fresh array of the frozen file values
	 */
	files(): readonly FileInterface[]
	/**
	 * Reads a text file whole.
	 *
	 * @param path - The path to read
	 * @returns The file's text, or `undefined` when the path is absent or holds binary content
	 */
	read(path: string): string | undefined
	/**
	 * Reads a clamped span of a text file.
	 *
	 * @param path - The path to read
	 * @param range - The requested half-open span, clamped to the text's bounds
	 * @returns The span's text and the span actually covered, or `undefined` when the path is absent
	 * @throws Thrown when a range is requested for binary content (`MODALITY`).
	 */
	read(path: string, range: Range): ReadResult | undefined
	/**
	 * Reads a batch of text files.
	 *
	 * @param paths - The paths to read
	 * @returns Each present text path mapped to its text, with absent and binary paths omitted
	 */
	read(paths: readonly string[]): Readonly<Record<string, string>>
	/**
	 * Checks whether one path is present.
	 *
	 * @param path - The path to test
	 * @returns True if the workspace holds the path; false otherwise
	 */
	has(path: string): boolean
	/**
	 * Checks whether every path in a batch is present.
	 *
	 * @param paths - The paths to test
	 * @returns True if every entry succeeded; false otherwise
	 */
	has(paths: readonly string[]): boolean
	/**
	 * Scans text files for a query, skipping binary content.
	 *
	 * @param query - The literal text, or regular-expression source under `regex`
	 * @param options - Optional matching controls
	 * @returns Each hit in insertion order across files, then line order within a file
	 * @throws Thrown when the pattern source will not compile (`PATTERN`).
	 */
	search(query: string, options?: SearchOptions): readonly SearchMatch[]
	/**
	 * Rewrites every match across the text files, skipping binary content.
	 *
	 * @param query - The literal text, or regular-expression source under `regex`
	 * @param replacement - The text each match becomes
	 * @param options - Optional matching controls
	 * @returns The occurrences replaced and the files changed
	 * @throws Thrown when the pattern source will not compile (`PATTERN`).
	 */
	replace(query: string, replacement: string, options?: SearchOptions): ReplaceResult
	/**
	 * Writes whole text to a path, creating it when absent and retyping a binary path as text.
	 *
	 * @param path - The path to write
	 * @param content - The text the path holds afterwards
	 */
	write(path: string, content: string): void
	/**
	 * Splices a clamped span of an existing text file.
	 *
	 * @param path - The path to edit
	 * @param content - The text the span becomes
	 * @param range - The half-open span to replace, clamped to the text's bounds
	 * @throws Thrown when a ranged write names a missing path (`MISSING`) or binary content
	 * (`MODALITY`), or the range is inverted or has a coordinate below 1 (`RANGE`).
	 */
	write(path: string, content: string, range: Range): void
	/**
	 * Writes a record batch, one whole-text write per entry.
	 *
	 * @param files - Each path mapped to the text it holds afterwards
	 */
	write(files: Readonly<Record<string, string>>): void
	/**
	 * Puts text before a path's existing content, treating an absent path as empty text.
	 *
	 * @param path - The path to edit
	 * @param content - The text placed before what is there
	 * @throws Thrown when the target path holds binary content (`MODALITY`).
	 */
	prepend(path: string, content: string): void
	/**
	 * Puts text before existing content for each entry of a record batch.
	 *
	 * @param files - Each path mapped to the text placed before what is there
	 * @throws Thrown when a target path holds binary content (`MODALITY`).
	 */
	prepend(files: Readonly<Record<string, string>>): void
	/**
	 * Puts text after a path's existing content, treating an absent path as empty text.
	 *
	 * @param path - The path to edit
	 * @param content - The text placed after what is there
	 * @throws Thrown when the target path holds binary content (`MODALITY`).
	 */
	append(path: string, content: string): void
	/**
	 * Puts text after existing content for each entry of a record batch.
	 *
	 * @param files - Each path mapped to the text placed after what is there
	 * @throws Thrown when a target path holds binary content (`MODALITY`).
	 */
	append(files: Readonly<Record<string, string>>): void
	/**
	 * Re-keys one file to a new path, keeping the source's insertion slot.
	 *
	 * @param from - The path to move
	 * @param to - The path the file takes
	 * @returns True if the file moved; false otherwise, which a same-path move also reports
	 */
	move(from: string, to: string): boolean
	/**
	 * Re-keys each entry of a mapping batch, moving every source it can.
	 *
	 * @param mapping - Each source path mapped to its target path
	 * @returns True if every entry succeeded; false otherwise
	 */
	move(mapping: Readonly<Record<string, string>>): boolean
	/**
	 * Drops one path, leaving an absent path untouched.
	 *
	 * @param path - The path to drop
	 * @returns True if a file was dropped; false otherwise
	 */
	remove(path: string): boolean
	/**
	 * Drops each path of a batch, dropping every present path.
	 *
	 * @param paths - The paths to drop
	 * @returns True if every entry succeeded; false otherwise
	 */
	remove(paths: readonly string[]): boolean
	/** Empties the workspace and emits one `clear`, never a burst of per-path removals. */
	clear(): void
	/**
	 * Projects the identity and a flat file list into a serializable value.
	 *
	 * @returns The JSON-serializable state a store persists
	 */
	snapshot(): WorkspaceSnapshot
	/** Releases the owned emitter, leaving the editing surface functional and unobserved. */
	destroy(): void
}

/**
 * Configures a workspace registry at construction.
 *
 * @remarks
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
	/** Reports how many workspaces the registry holds. */
	readonly count: number
	/** Reports the current selection, resolved through the registry on every read. */
	readonly active: WorkspaceInterface | undefined
	/**
	 * Finds one registered workspace by id.
	 *
	 * @param id - The workspace identifier
	 * @returns The registered workspace, or `undefined` when the id is unknown
	 */
	workspace(id: string): WorkspaceInterface | undefined
	/**
	 * Lists registered workspaces in insertion order.
	 *
	 * @returns A fresh array of the registered workspaces
	 */
	workspaces(): readonly WorkspaceInterface[]
	/**
	 * Creates and registers a workspace, activating it when no selection is active yet.
	 *
	 * @param options - Optional identity, emitter configuration, and initial files; the registry's
	 * own `on` and `error` supply the defaults
	 * @returns The registered workspace
	 */
	add(options?: WorkspaceOptions): WorkspaceInterface
	/**
	 * Re-points the active selection at a registered workspace.
	 *
	 * @param id - The workspace identifier
	 * @returns The newly active workspace, or `undefined` when the id is unknown, which leaves the
	 * selection unchanged
	 */
	switch(id: string): WorkspaceInterface | undefined
	/**
	 * Activates a registered workspace, or hydrates one from a stored snapshot on a registry miss.
	 *
	 * @param id - The workspace identifier
	 * @returns The active workspace, or `undefined` when neither the registry nor the store holds
	 * the id
	 */
	open(id: string): Promise<WorkspaceInterface | undefined>
	/**
	 * Persists a registered workspace's snapshot under its own id.
	 *
	 * @param id - The workspace identifier
	 * @returns True if the snapshot was written; false otherwise, which an unregistered id and a
	 * registry with no store both report
	 */
	save(id: string): Promise<boolean>
	/**
	 * Drops one registered workspace and destroys it.
	 *
	 * @param id - The workspace identifier
	 * @returns True if a workspace was dropped; false otherwise
	 */
	remove(id: string): boolean
	/**
	 * Drops each id of a batch, dropping every registered one.
	 *
	 * @param ids - The workspace identifiers
	 * @returns True if every entry succeeded; false otherwise
	 */
	remove(ids: readonly string[]): boolean
	/** Empties the registry, destroying each workspace and clearing the selection. */
	clear(): void
}
