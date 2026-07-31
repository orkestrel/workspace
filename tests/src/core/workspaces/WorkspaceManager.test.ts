import {
	createBinaryContent,
	createFile,
	createMemoryWorkspaceStore,
	createTextContent,
	createWorkspaceManager,
	Workspace,
	WorkspaceManager,
} from '@src/core'
import { describe, expect, it } from 'vitest'

// WorkspaceManager is the §9 registry over the workspace layer WITH an active pointer — an
// insertion-ordered store keyed by id (add / workspace / workspaces / count / remove(id|ids[]) /
// clear) PLUS active / switch. Event-free (each Workspace owns its own emitter). The first add
// auto-activates; a later add leaves active; switch re-points it; removing the active (or clear)
// clears it. Real data, no mocks (AGENTS §16) — each `add` mints a genuine Workspace.

describe('WorkspaceManager — add / accessors / count', () => {
	it('starts empty with no active workspace', () => {
		const manager = new WorkspaceManager()

		expect(manager.count).toBe(0)
		expect(manager.workspaces()).toEqual([])
		expect(manager.active).toBeUndefined()
	})

	it('add() mints a Workspace, stores it, and returns it', () => {
		const manager = new WorkspaceManager()

		const workspace = manager.add()

		expect(workspace).toBeInstanceOf(Workspace)
		expect(manager.count).toBe(1)
		expect(manager.workspace(workspace.id)).toBe(workspace)
		expect(manager.workspaces()).toEqual([workspace])
	})

	it('add({ id }) uses the supplied id', () => {
		const manager = new WorkspaceManager()

		const workspace = manager.add({ id: 'fixed' })

		expect(workspace.id).toBe('fixed')
		expect(manager.workspace('fixed')).toBe(workspace)
	})

	it('add() with no id mints a distinct one each time', () => {
		const manager = new WorkspaceManager()
		const a = manager.add()
		const b = manager.add()

		expect(a.id).not.toBe(b.id)
		expect(manager.count).toBe(2)
	})

	it('workspace(id) returns undefined for an unknown id', () => {
		const manager = new WorkspaceManager()

		expect(manager.workspace('nope')).toBeUndefined()
	})

	it('workspaces() lists in insertion order', () => {
		const manager = new WorkspaceManager()
		const a = manager.add({ id: 'a' })
		const b = manager.add({ id: 'b' })
		const c = manager.add({ id: 'c' })

		expect(manager.workspaces()).toEqual([a, b, c])
	})

	it('a re-add of the same id OVERWRITES (last write wins)', () => {
		const manager = new WorkspaceManager()
		const first = manager.add({ id: 'dup' })
		const second = manager.add({ id: 'dup' })

		expect(manager.count).toBe(1)
		expect(manager.workspace('dup')).toBe(second)
		expect(manager.workspace('dup')).not.toBe(first)
	})

	it('add({ seed }) seats initial files into the created workspace', () => {
		const manager = new WorkspaceManager()
		const text = createFile({
			path: 'a.ts',
			content: { text: 'const x = 1', language: 'typescript' },
		})

		const workspace = manager.add({ seed: [text] })

		expect(workspace.count).toBe(1)
		expect(workspace.read('a.ts')).toBe('const x = 1')
	})
})

describe('WorkspaceManager — active pointer + switch + auto-activate', () => {
	it('the FIRST add auto-activates; a later add leaves active unchanged', () => {
		const manager = new WorkspaceManager()

		const first = manager.add({ id: 'a' })
		expect(manager.active).toBe(first) // first add auto-activates

		const second = manager.add({ id: 'b' })
		expect(manager.active).toBe(first) // a later add does NOT steal active
		expect(second).not.toBe(first)
	})

	it('switch(id) re-points active and returns it', () => {
		const manager = new WorkspaceManager()
		manager.add({ id: 'a' })
		const b = manager.add({ id: 'b' })

		const switched = manager.switch('b')

		expect(switched).toBe(b)
		expect(manager.active).toBe(b)
	})

	it('switch(unknownId) returns undefined and leaves active unchanged', () => {
		const manager = new WorkspaceManager()
		const a = manager.add({ id: 'a' })

		expect(manager.switch('ghost')).toBeUndefined()
		expect(manager.active).toBe(a) // unchanged — lenient, no throw
	})

	it('the active pointer follows a re-add of the active id (live lookup, never stale)', () => {
		const manager = new WorkspaceManager()
		manager.add({ id: 'a' }) // active
		const replacement = manager.add({ id: 'a' }) // overwrite the active id

		expect(manager.active).toBe(replacement)
	})
})

describe('WorkspaceManager — remove (§9.2) / clear', () => {
	it('remove(id) drops one and reports whether any was removed', () => {
		const manager = new WorkspaceManager()
		manager.add({ id: 'a' })
		manager.add({ id: 'b' })

		expect(manager.remove('a')).toBe(true)
		expect(manager.remove('missing')).toBe(false)
		expect(manager.count).toBe(1)
		expect(manager.workspace('a')).toBeUndefined()
		expect(manager.workspace('b')).toBeDefined()
	})

	it('remove(ids[]) drops a batch — true when ANY was removed', () => {
		const manager = new WorkspaceManager()
		manager.add({ id: 'a' })
		manager.add({ id: 'b' })
		manager.add({ id: 'c' })

		expect(manager.remove(['a', 'c', 'ghost'])).toBe(true)
		expect(manager.count).toBe(1)
		expect(manager.workspaces().map((one) => one.id)).toEqual(['b'])
	})

	it('remove(ids[]) of only-absent ids returns false', () => {
		const manager = new WorkspaceManager()
		manager.add({ id: 'a' })

		expect(manager.remove(['x', 'y'])).toBe(false)
		expect(manager.count).toBe(1)
	})

	it('removing the ACTIVE workspace clears active', () => {
		const manager = new WorkspaceManager()
		manager.add({ id: 'a' }) // auto-active
		manager.add({ id: 'b' })

		expect(manager.remove('a')).toBe(true)
		expect(manager.active).toBeUndefined() // the active one was removed
	})

	it('removing a NON-active workspace leaves active intact', () => {
		const manager = new WorkspaceManager()
		const a = manager.add({ id: 'a' }) // auto-active
		manager.add({ id: 'b' })

		expect(manager.remove('b')).toBe(true)
		expect(manager.active).toBe(a) // still pointing at a
	})

	it('removing the active in a BATCH clears active', () => {
		const manager = new WorkspaceManager()
		manager.add({ id: 'a' }) // auto-active
		manager.add({ id: 'b' })

		expect(manager.remove(['a', 'b'])).toBe(true)
		expect(manager.active).toBeUndefined()
	})

	it('clear empties the registry and clears active', () => {
		const manager = new WorkspaceManager()
		manager.add({ id: 'a' })
		manager.add({ id: 'b' })

		manager.clear()

		expect(manager.count).toBe(0)
		expect(manager.workspaces()).toEqual([])
		expect(manager.active).toBeUndefined()
	})

	it('destroys every workspace departing through single, batch, and clear removal', () => {
		const manager = new WorkspaceManager()
		const single = manager.add({ id: 'single' })
		const batchA = manager.add({ id: 'batch-a' })
		const batchB = manager.add({ id: 'batch-b' })
		const cleared = manager.add({ id: 'cleared' })

		expect(manager.remove('single')).toBe(true)
		expect(single.emitter.destroyed).toBe(true)
		expect(manager.remove(['batch-a', 'batch-b'])).toBe(true)
		expect(batchA.emitter.destroyed).toBe(true)
		expect(batchB.emitter.destroyed).toBe(true)
		expect(cleared.emitter.destroyed).toBe(false)
		manager.clear()
		expect(cleared.emitter.destroyed).toBe(true)
	})
})

describe('WorkspaceManager — defaults flow into created workspaces, per-add overrides win', () => {
	it("created workspaces inherit the manager's default on / error listeners", () => {
		const written: string[] = []
		const manager = new WorkspaceManager({ on: { write: (file) => written.push(file.path) } })
		const workspace = manager.add()

		workspace.write('a.ts', 'x')

		// The manager's default `write` listener fired — proving it flowed into the workspace.
		expect(written).toEqual(['a.ts'])
	})

	it('a per-add on OVERRIDES the manager default', () => {
		const fromManager: string[] = []
		const fromAdd: string[] = []
		const manager = new WorkspaceManager({ on: { write: (file) => fromManager.push(file.path) } })
		const workspace = manager.add({ on: { write: (file) => fromAdd.push(file.path) } })

		workspace.write('a.ts', 'x')

		expect(fromAdd).toEqual(['a.ts'])
		expect(fromManager).toHaveLength(0) // the manager default was bypassed
	})
})

describe('WorkspaceManager — created workspaces are independent', () => {
	it('each workspace has its own files', () => {
		const manager = new WorkspaceManager()
		const a = manager.add({ id: 'a' })
		const b = manager.add({ id: 'b' })

		a.write('only-in-a.ts', 'x')

		expect(a.count).toBe(1)
		expect(b.count).toBe(0)
		expect(b.has('only-in-a.ts')).toBe(false)
	})
})

describe('createWorkspaceManager', () => {
	it('returns an empty WorkspaceManager', () => {
		const manager = createWorkspaceManager()

		expect(manager).toBeInstanceOf(WorkspaceManager)
		expect(manager.count).toBe(0)
		expect(manager.active).toBeUndefined()
	})

	it('flows its default on into created workspaces', () => {
		const cleared: number[] = []
		const manager = createWorkspaceManager({ on: { clear: () => cleared.push(1) } })
		const workspace = manager.add()

		workspace.clear()

		expect(cleared).toHaveLength(1)
	})
})

describe('WorkspaceManager — open / save over a real store (W-d hydration seam)', () => {
	it('open(id) of an ALREADY-registered id activates it WITHOUT hitting the store', async () => {
		// A registry hit short-circuits: the workspace is activated (switched to) and returned, no
		// store.get. Works even WITHOUT a store (the registry is the live source).
		const manager = new WorkspaceManager()
		manager.add({ id: 'a' }) // auto-active
		const b = manager.add({ id: 'b' }) // not active

		const opened = await manager.open('b')

		expect(opened).toBe(b)
		expect(manager.active).toBe(b) // activated in place
		expect(manager.count).toBe(2) // nothing new was created
	})

	it('open(id) of an unknown id with NO store returns undefined (lenient)', async () => {
		const manager = new WorkspaceManager() // no store
		expect(await manager.open('ghost')).toBeUndefined()
		expect(manager.active).toBeUndefined()
	})

	it('open(id) HYDRATES from the store on a registry miss (load → activate), files intact', async () => {
		// Persist a workspace with BOTH a text and a binary file through one manager, then open it on
		// a FRESH manager sharing the same store — the registry-miss → store-load → seed-hydrate path.
		const store = createMemoryWorkspaceStore()
		const author = new WorkspaceManager({ store })
		const original = author.add({ id: 'project' })
		original.write('src/main.ts', 'const x = 1')
		// Seat a binary file (the edit surface only mints text) — re-add through the seed seam.
		const icon = createFile({ path: 'icon.png', content: createBinaryContent('AAAA', 'image/png') })
		const seeded = author.add({
			id: 'project',
			seed: [...original.files(), icon],
		})
		expect(await author.save('project')).toBe(true)

		// A brand-new manager over the SAME store has nothing registered yet.
		const reader = new WorkspaceManager({ store })
		expect(reader.workspace('project')).toBeUndefined()

		const opened = await reader.open('project')

		expect(opened).toBeDefined()
		if (opened === undefined) return
		// Hydrated + registered + activated.
		expect(reader.count).toBe(1)
		expect(reader.active).toBe(opened)
		expect(opened.id).toBe('project')
		// The hydrated workspace's files EQUAL the originals (text + binary survived).
		expect(opened.files()).toEqual(seeded.files())
		expect(opened.read('src/main.ts')).toBe('const x = 1')
		expect(opened.file('icon.png')?.content).toEqual({ data: 'AAAA', mime: 'image/png' })
	})

	it('open(id) on a store MISS (id never persisted) returns undefined', async () => {
		const store = createMemoryWorkspaceStore()
		const manager = new WorkspaceManager({ store })
		expect(await manager.open('never-saved')).toBeUndefined()
		expect(manager.count).toBe(0)
	})

	it('open into a NON-EMPTY registry still activates the hydrated workspace', async () => {
		// `add` only auto-activates the FIRST workspace, so a hydrating open into a populated registry
		// must explicitly re-point active to the loaded one.
		const store = createMemoryWorkspaceStore()
		const author = new WorkspaceManager({ store })
		const saved = author.add({ id: 'stored' })
		saved.write('a.txt', 'hello')
		await author.save('stored')

		const manager = new WorkspaceManager({ store })
		manager.add({ id: 'scratch' }) // auto-active — registry is now non-empty

		const opened = await manager.open('stored')

		expect(opened?.id).toBe('stored')
		expect(manager.active).toBe(opened) // re-pointed, not left on 'scratch'
	})

	it('save(id) persists a registered workspace; a fresh manager over the same store opens it', async () => {
		const store = createMemoryWorkspaceStore()
		const author = new WorkspaceManager({ store })
		const workspace = author.add({ id: 'doc' })
		workspace.write('notes.md', '# Title')

		expect(await author.save('doc')).toBe(true)

		// A fresh manager + the SAME store round-trips it.
		const reader = new WorkspaceManager({ store })
		const opened = await reader.open('doc')
		expect(opened?.read('notes.md')).toBe('# Title')
		expect(opened?.files()).toEqual(workspace.files())
	})

	it('save(id) with NO store returns false (a no-op)', async () => {
		const manager = new WorkspaceManager() // no store
		manager.add({ id: 'a' })
		expect(await manager.save('a')).toBe(false)
	})

	it('save(id) of an UNKNOWN id returns false (a no-op), even with a store', async () => {
		const store = createMemoryWorkspaceStore()
		const manager = new WorkspaceManager({ store })
		expect(await manager.save('ghost')).toBe(false)
		// Nothing was written — opening it back finds nothing.
		expect(await manager.open('ghost')).toBeUndefined()
	})

	it('save then re-save persists the LATEST snapshot (upsert)', async () => {
		const store = createMemoryWorkspaceStore()
		const manager = new WorkspaceManager({ store })
		const workspace = manager.add({ id: 'live' })
		workspace.write('a.txt', 'v1')
		await manager.save('live')

		// Mutate + re-save — the store holds the latest snapshot.
		workspace.write('a.txt', 'v2')
		workspace.write('b.txt', 'new')
		await manager.save('live')

		const reader = new WorkspaceManager({ store })
		const opened = await reader.open('live')
		expect(opened?.read('a.txt')).toBe('v2')
		expect(opened?.read('b.txt')).toBe('new')
	})

	it('keeps a stored snapshot when its live workspace leaves the registry', async () => {
		const store = createMemoryWorkspaceStore()
		const manager = new WorkspaceManager({ store })
		const workspace = manager.add({ id: 'durable' })
		workspace.write('a.txt', 'saved')
		expect(await manager.save('durable')).toBe(true)
		expect(manager.remove('durable')).toBe(true)

		const reader = new WorkspaceManager({ store })
		expect((await reader.open('durable'))?.read('a.txt')).toBe('saved')
	})

	it('preserves padded and unpadded binary sizes and stored state through save/open', async () => {
		const store = createMemoryWorkspaceStore()
		const author = new WorkspaceManager({ store })
		const padded = createFile({
			path: 'padded.bin',
			content: createBinaryContent('AA==', 'image/png'),
			state: 'modified',
		})
		const unpadded = createFile({
			path: 'unpadded.bin',
			content: createBinaryContent('AAA', 'image/webp'),
			state: 'created',
		})
		const workspace = author.add({ id: 'binary', seed: [padded, unpadded] })
		const snapshot = workspace.snapshot()
		expect(await author.save('binary')).toBe(true)

		const reader = new WorkspaceManager({ store })
		const opened = await reader.open('binary')

		expect(opened?.snapshot()).toEqual(snapshot)
		expect(opened?.file('padded.bin')?.size).toBe(1)
		expect(opened?.file('padded.bin')?.state).toBe('modified')
		expect(opened?.file('unpadded.bin')?.size).toBe(2)
		expect(opened?.file('unpadded.bin')?.state).toBe('created')
	})
})

describe('Workspace — snapshot() round-trips (text + binary) through createWorkspaceManager seed', () => {
	it('snapshot() serializes id + a flat file list, and a seeded workspace re-snapshots equal', () => {
		const manager = new WorkspaceManager()
		const text = createFile({
			path: 'a.ts',
			content: createTextContent('const x = 1', 'typescript'),
			state: 'modified',
		})
		const binary = createFile({
			path: 'icon.png',
			content: createBinaryContent('AAAA', 'image/png'),
		})
		const original = manager.add({
			id: 'w',
			seed: [text, binary],
		})

		const snapshot = original.snapshot()
		expect(snapshot.id).toBe('w')
		expect(snapshot.files).toEqual([text, binary])

		// Re-seed a NEW workspace from the snapshot's files — its own snapshot deep-equals the first
		// (the seed seam + snapshot() are inverse for the serializable shape).
		const rehydrated = manager.add({
			id: snapshot.id,
			seed: snapshot.files,
		})
		expect(rehydrated.snapshot()).toEqual(snapshot)
	})
})
