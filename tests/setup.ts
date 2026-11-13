import type { SearchOptions, WorkspaceSnapshot, WorkspaceStoreInterface } from '@src/core'
import {
	createBinaryContent,
	createFile,
	createTextContent,
	createWorkspace,
	Workspace,
} from '@src/core'
import { createRecorder } from '@orkestrel/test'

/** Represents one observable scenario every workspace store implementation must satisfy. */
export interface WorkspaceStoreCase {
	readonly name: string
	probe(
		store: WorkspaceStoreInterface,
		build: (id?: string) => WorkspaceSnapshot,
	): Promise<{ readonly actual: unknown; readonly expected: unknown }>
}

/**
 * Builds a real workspace snapshot containing text and binary files.
 *
 * @param id - The workspace identifier
 * @returns A workspace snapshot
 */
export function buildWorkspaceSnapshot(id = 'scratch'): WorkspaceSnapshot {
	const icon = createFile({ path: 'icon.png', content: createBinaryContent('AAAA', 'image/png') })
	const workspace = createWorkspace({ id })
	workspace.write('src/main.ts', 'const x = 1')
	const written = workspace.snapshot()
	return { id: written.id, files: [...written.files, icon] }
}

/**
 * Carries the shared observable contract every workspace store satisfies, as data.
 *
 * Each case drives a fresh store through one scenario and returns what it observed beside what the
 * contract requires. A test file loops the table and compares the pair, so this module states the
 * contract and registers nothing.
 */
export const WORKSPACE_STORE_CASES: readonly WorkspaceStoreCase[] = [
	{
		name: 'round-trips text and binary files',
		async probe(store, build) {
			const snapshot = build()
			await store.set(snapshot)
			const stored = await store.get(snapshot.id)
			return {
				actual: { stored, paths: stored?.files.map((file) => file.path) },
				expected: { stored: snapshot, paths: ['src/main.ts', 'icon.png'] },
			}
		},
	},
	{
		name: 'replaces a snapshot under the same id',
		async probe(store, build) {
			await store.set(build('work'))
			const replacement: WorkspaceSnapshot = {
				id: 'work',
				files: [createFile({ path: 'only.txt', content: createTextContent('only', 'text') })],
			}
			await store.set(replacement)
			return { actual: await store.get('work'), expected: replacement }
		},
	},
	{
		name: 'deletes present values and ignores absent ids',
		async probe(store, build) {
			const snapshot = build()
			await store.set(snapshot)
			await store.delete(snapshot.id)
			const deleted = await store.get(snapshot.id)
			const resolved = await store.delete('absent')
			return {
				actual: { deleted, resolved, absent: await store.get('absent') },
				expected: { deleted: undefined, resolved: undefined, absent: undefined },
			}
		},
	},
	{
		name: 'keeps distinct ids independent',
		async probe(store, build) {
			const alpha = build('alpha')
			const beta = build('beta')
			await store.set(alpha)
			await store.set(beta)
			const stored = { alpha: await store.get('alpha'), beta: await store.get('beta') }
			await store.delete('alpha')
			return {
				actual: {
					...stored,
					droppedAlpha: await store.get('alpha'),
					keptBeta: await store.get('beta'),
				},
				expected: { alpha, beta, droppedAlpha: undefined, keptBeta: beta },
			}
		},
	},
]

/**
 * Implements the persistence interface over a map.
 *
 * The case table under test takes a store, so a conforming store is its input. This one is
 * written here rather than taken from `@src/core` so the table is not proven against the same
 * implementation the mirrored store suites already drive it with.
 */
export class MapWorkspaceStore implements WorkspaceStoreInterface {
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

/** Records each store supplied to the shared cases. */
export const seen = createRecorder<readonly [WorkspaceStoreInterface]>()

/** Creates a store and records its identity for the case-population proof. */
export function createRecordedStore(): WorkspaceStoreInterface {
	const store = new MapWorkspaceStore()
	seen.handler(store)
	return store
}
/** Creates a workspace containing a real binary image file. */
export function imageWorkspace(): Workspace {
	const image = createFile({ path: 'icon.png', content: createBinaryContent('AAAA', 'image/png') })
	return new Workspace({ seed: [image] })
}

/**
 * Creates a workspace seeded silently with `secret.md` then `notes.md`, each holding the query
 * `vault` once on each of its two lines.
 *
 * @returns A workspace whose first file in insertion order is the one a `paths` list leaves out
 */
export function createSecretWorkspace(): Workspace {
	return new Workspace({
		seed: [
			createFile({
				path: 'secret.md',
				content: createTextContent('The vault code is 7731.\nThe vault code is 7731.', 'markdown'),
			}),
			createFile({
				path: 'notes.md',
				content: createTextContent(
					'The vault holds notes.\nThe vault holds more notes.',
					'markdown',
				),
			}),
		],
	})
}

/** Lists each malformed `paths` value a search or a replacement refuses, by a readable name. */
export const MALFORMED_PATHS: ReadonlyArray<readonly [name: string, value: unknown]> =
	Object.freeze([
		['a bare path string', 'notes.md'],
		['null', null],
		['a list holding a number', ['notes.md', 7]],
		['a list holding undefined', [undefined]],
		['a sparse list', new Array<string>(1)],
		['an array-like record', { 0: 'notes.md', length: 1 }],
		['a set of paths', new Set(['notes.md'])],
	])

/**
 * Lists every combination of `regex` and `sensitive` (each unset, `true`, or `false`) with
 * `limit` (unset, 1, 2, or 3), so a `paths` claim is driven under each matching mode.
 */
export const SCOPED_SEARCH_OPTIONS: readonly SearchOptions[] = Object.freeze(
	[undefined, true, false].flatMap((regex) =>
		[undefined, true, false].flatMap((sensitive) =>
			[undefined, 1, 2, 3].map((limit) => ({
				...(regex === undefined ? {} : { regex }),
				...(sensitive === undefined ? {} : { sensitive }),
				...(limit === undefined ? {} : { limit }),
			})),
		),
	),
)
