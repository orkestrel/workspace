import type { WorkspaceSnapshot, WorkspaceStoreInterface } from '@src/core'
import type { EmitterInterface, EventMap } from '@orkestrel/emitter'
import type { RecorderInterface } from '@orkestrel/test'
import { createBinaryContent, createFile, createTextContent, createWorkspace } from '@src/core'
import { createRecorder } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'

/** Recorders keyed by the events they observe. */
export type EmitterRecorders<TMap extends EventMap, TName extends keyof TMap> = {
	readonly [K in TName]: RecorderInterface<TMap[K]>
}

/**
 * Create a listener-error recorder.
 *
 * @returns A recorder for error and event pairs
 */
export function createErrorRecorder(): RecorderInterface<readonly [error: unknown, event: string]> {
	return createRecorder<readonly [error: unknown, event: string]>()
}

/**
 * Determine whether every requested event has a recorder.
 *
 * @typeParam TMap - The emitter event map
 * @typeParam TName - The event-name subset
 * @param recorders - The partial recorder map
 * @param events - The required event names
 * @returns Whether the map contains every requested event
 */
export function isTotal<TMap extends EventMap, TName extends keyof TMap>(
	recorders: Partial<EmitterRecorders<TMap, TName>>,
	events: readonly TName[],
): recorders is EmitterRecorders<TMap, TName> {
	return events.every((name) => recorders[name] !== undefined)
}

/**
 * Subscribe one recorder to each requested emitter event.
 *
 * @typeParam TMap - The emitter event map
 * @typeParam TName - The event-name subset
 * @param emitter - The emitter to observe
 * @param events - The event names to record
 * @returns Recorders keyed by event name
 */
export function recordEmitterEvents<TMap extends EventMap, TName extends keyof TMap>(
	emitter: EmitterInterface<TMap>,
	events: readonly TName[],
): EmitterRecorders<TMap, TName> {
	const recorders: Partial<EmitterRecorders<TMap, TName>> = {}
	for (const name of events) {
		const recorder = createRecorder<TMap[typeof name]>()
		emitter.on(name, recorder.handler)
		recorders[name] = recorder
	}
	if (!isTotal(recorders, events)) throw new Error('missing event recorder')
	return recorders
}

/**
 * Round-trip a value through JSON serialization, for a snapshot type that does not satisfy
 * `@orkestrel/test`'s `roundTripJSON<T extends JSONValue>` — `WorkspaceSnapshot`'s nested
 * `FileInterface[]` has no index signature, so the fleet-wide helper's constraint cannot admit it
 * without a deep reconstruction that would change what the round-trip proves.
 *
 * @typeParam T - The serializable value type
 * @param value - The value to clone
 * @returns The parsed JSON clone
 */
export function roundTripJSON<T>(value: T): T {
	return JSON.parse(JSON.stringify(value))
}

/** Create a plain record whose named property throws when read. */
export function createThrowingGetterRecord(property: string): object {
	return Object.defineProperty({}, property, {
		enumerable: true,
		get: throwGetter,
	})
}

/** Create a revoked proxy for total-guard tests. */
export function createRevokedProxy(): object {
	const revocable = Proxy.revocable({}, {})
	revocable.revoke()
	return revocable.proxy
}

function throwGetter(): never {
	throw new Error('hostile getter')
}

/**
 * Build a real workspace snapshot containing text and binary files.
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
 * Register the shared observable contract suite for a workspace store.
 *
 * @param makeStore - A fresh-store factory
 * @param build - A snapshot builder
 */
export function assertWorkspaceStoreContract(
	makeStore: () => WorkspaceStoreInterface,
	build: (id?: string) => WorkspaceSnapshot,
): void {
	describe('workspace store contract', () => {
		it('round-trips text and binary files', async () => {
			const store = makeStore()
			const snapshot = build()
			await store.set(snapshot)
			const stored = await store.get(snapshot.id)
			expect(stored).toEqual(snapshot)
			expect(stored?.files.map((file) => file.path)).toEqual(['src/main.ts', 'icon.png'])
		})

		it('replaces a snapshot under the same id', async () => {
			const store = makeStore()
			await store.set(build('work'))
			const replacement: WorkspaceSnapshot = {
				id: 'work',
				files: [createFile({ path: 'only.txt', content: createTextContent('only', 'text') })],
			}
			await store.set(replacement)
			expect(await store.get('work')).toEqual(replacement)
		})

		it('deletes present values and ignores absent ids', async () => {
			const store = makeStore()
			const snapshot = build()
			await store.set(snapshot)
			await store.delete(snapshot.id)
			expect(await store.get(snapshot.id)).toBeUndefined()
			await expect(store.delete('absent')).resolves.toBeUndefined()
			expect(await store.get('absent')).toBeUndefined()
		})

		it('keeps distinct ids independent', async () => {
			const store = makeStore()
			const alpha = build('alpha')
			const beta = build('beta')
			await store.set(alpha)
			await store.set(beta)
			expect(await store.get('alpha')).toEqual(alpha)
			expect(await store.get('beta')).toEqual(beta)
			await store.delete('alpha')
			expect(await store.get('alpha')).toBeUndefined()
			expect(await store.get('beta')).toEqual(beta)
		})
	})
}

/**
 * Determine whether a Vue file belongs to a private browser application.
 *
 * @param path - The repository-relative path
 * @returns Whether the path is under `app/browser`
 */
export function isBrowserVuePath(path: string): boolean {
	return path.replaceAll('\\', '/').startsWith('app/browser/')
}
