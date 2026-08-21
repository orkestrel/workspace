import type { WorkspaceSnapshot, WorkspaceStoreInterface } from '@src/core'
import { createBinaryContent, createFile, createTextContent, createWorkspace } from '@src/core'
import { describe, expect, it } from 'vitest'

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
