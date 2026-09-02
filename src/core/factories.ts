import type {
	BinaryMIME,
	FileContent,
	FileInput,
	FileInterface,
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
 * Create an immutable file with derived size and line counts.
 *
 * @param input - The file path, content, and optional state
 * @returns A frozen file record
 *
 * @example
 * ```ts
 * import { createFile, createTextContent } from '@orkestrel/workspace'
 *
 * createFile({ path: 'a.txt', content: createTextContent('hello', 'text') })
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
 * Create the text arm of {@link FileContent}.
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
export function createTextContent(text: string, language: string): FileContent {
	return { text, language }
}

/**
 * Creates the binary arm of {@link FileContent}.
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
export function createBinaryContent(base64: string, mime: BinaryMIME): FileContent {
	return { base64, mime }
}

/**
 * Create a workspace.
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
 * Create an in-memory workspace snapshot store.
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
 * Create a database-backed workspace snapshot store.
 *
 * @param driver - The database driver; defaults to an in-memory driver
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
 * Create an empty workspace registry.
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
