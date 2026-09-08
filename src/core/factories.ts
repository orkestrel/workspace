import type {
	BinaryContent,
	BinaryMIME,
	FileInput,
	FileInterface,
	TextContent,
	WorkspaceInterface,
	WorkspaceManagerInterface,
	WorkspaceManagerOptions,
	WorkspaceOptions,
	WorkspaceSnapshotRow,
	WorkspaceStoreInterface,
} from './types.js'
import type { DriverInterface, TableInterface } from '@orkestrel/database'
import { rawShape, stringShape } from '@orkestrel/contract'
import { createDatabase, createMemoryDriver } from '@orkestrel/database'
import { computeSize, countLines } from './helpers.js'
import { Workspace } from './workspaces/Workspace.js'
import { WorkspaceManager } from './workspaces/WorkspaceManager.js'
import { DatabaseWorkspaceStore } from './workspaces/stores/DatabaseWorkspaceStore.js'
import { MemoryWorkspaceStore } from './workspaces/stores/MemoryWorkspaceStore.js'

/**
 * Creates an immutable file with derived size and line counts.
 *
 * @param input - The file path, content, and optional state
 * @returns A frozen file record
 *
 * @example Files and content
 * ```ts
 * import {
 * 	computeSize,
 * 	countLines,
 * 	createBinaryContent,
 * 	createFile,
 * 	createTextContent,
 * 	inferLanguage,
 * 	isBinary,
 * 	isText,
 * } from '@orkestrel/workspace'
 *
 * const note = createFile({
 * 	path: 'notes.md',
 * 	content: createTextContent('# Title\nBody', inferLanguage('notes.md')), // 'markdown'
 * })
 *
 * note.size // 12 — UTF-8 bytes, through computeSize
 * note.lines // 2 — through countLines
 * note.state // 'created'
 * isText(note.content) // true
 *
 * const icon = createFile({ path: 'icon.png', content: createBinaryContent('AAAA', 'image/png') })
 * isBinary(icon.content) // true
 * icon.size // 3 — decoded base64 bytes, through computeDecodedSize
 * ```
 */
export function createFile(input: FileInput): FileInterface {
	return Object.freeze({
		path: input.path,
		content: input.content,
		state: input.state ?? 'created',
		size: computeSize(input.content),
		lines: countLines(input.content),
	})
}

/**
 * Creates the text arm of {@link FileContent}, returned as {@link TextContent} rather than as
 * the whole union.
 *
 * @param text - The text body
 * @param language - The language tag
 * @returns Text file content
 *
 * @example
 * ```ts
 * import { createTextContent } from '@orkestrel/workspace'
 *
 * createTextContent('hello', 'text')
 * ```
 */
export function createTextContent(text: string, language: string): TextContent {
	return { text, language }
}

/**
 * Creates the binary arm of {@link FileContent}, returned as {@link BinaryContent} rather than
 * as the whole union.
 *
 * @param base64 - The base64 payload
 * @param mime - The binary MIME
 * @returns Binary file content
 *
 * @example
 * ```ts
 * import { createBinaryContent } from '@orkestrel/workspace'
 *
 * createBinaryContent('AAAA', 'image/png')
 * ```
 */
export function createBinaryContent(base64: string, mime: BinaryMIME): BinaryContent {
	return { base64, mime }
}

/**
 * Creates a workspace with the same identity, emitter, and seed options the constructor takes.
 *
 * @param options - Optional identity, emitter configuration, and initial files
 * @returns A working workspace
 *
 * @example
 * ```ts
 * import { createWorkspace } from '@orkestrel/workspace'
 *
 * const workspace = createWorkspace()
 * workspace.write('a.txt', 'hello')
 * ```
 */
export function createWorkspace(options?: WorkspaceOptions): WorkspaceInterface {
	return new Workspace(options)
}

/**
 * Creates an in-memory workspace snapshot store.
 *
 * @returns A process-local workspace store
 *
 * @example
 * ```ts
 * import { createMemoryWorkspaceStore } from '@orkestrel/workspace'
 *
 * const store = createMemoryWorkspaceStore()
 * ```
 */
export function createMemoryWorkspaceStore(): WorkspaceStoreInterface {
	return new MemoryWorkspaceStore()
}

/**
 * Creates a database-backed workspace snapshot store, over an in-memory driver when the caller
 * supplies none.
 *
 * @param driver - The database driver. Default: an in-memory driver.
 * @returns A workspace store backed by the supplied driver
 *
 * @example
 * ```ts
 * import { createDatabaseWorkspaceStore } from '@orkestrel/workspace'
 *
 * const store = createDatabaseWorkspaceStore()
 * ```
 */
export function createDatabaseWorkspaceStore(
	driver: DriverInterface = createMemoryDriver(),
): WorkspaceStoreInterface {
	const columns = { id: stringShape(), snapshot: rawShape({}) }
	const database = createDatabase({ driver, tables: { workspaces: columns } })
	const table: TableInterface<WorkspaceSnapshotRow> = database.table('workspaces')
	return new DatabaseWorkspaceStore(table)
}

/**
 * Creates an empty workspace registry.
 *
 * @param options - Default event hooks and optional durability
 * @returns A workspace manager
 *
 * @example
 * ```ts
 * import { createWorkspaceManager } from '@orkestrel/workspace'
 *
 * const manager = createWorkspaceManager()
 * manager.add()
 * ```
 */
export function createWorkspaceManager(
	options?: WorkspaceManagerOptions,
): WorkspaceManagerInterface {
	return new WorkspaceManager(options)
}
