// The consumer-side guides-parity drop-in: runs `@orkestrel/guide`'s checks against
// this repo's own `guides/README.md` manifest. The four constants below are this
// package's own, and are the only part a sibling package changes.

import type { WorkspaceEventMap } from '@src/core'
import {
	createBinaryContent,
	createDatabaseWorkspaceStore,
	createFile,
	createMemoryWorkspaceStore,
	createTextContent,
	createWorkspace,
	createWorkspaceManager,
	escapeRegExp,
	inferLanguage,
	isBinary,
	isText,
	isWorkspaceError,
	isWorkspaceSnapshot,
	rangeOf,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	computeSymbolKey,
	createGuide,
	createSource,
	createSourceManager,
	extractFenceImports,
	findMissing,
	findMissingSymbols,
	findUnexampled,
	findUnlisted,
	isExternalLink,
	parseManifest,
	resolveLink,
} from '@orkestrel/guide'
import { readFileSync } from 'node:fs'
import { createRecorders, requireValue } from '@orkestrel/test'
import { readInventory } from '@orkestrel/test/server'

/** Every fence language this package's guides are allowed to use. */
const FENCE_LANGUAGES = Object.freeze(['ts'])
/** The fence language whose blocks count as worked examples. */
const EXAMPLE_LANGUAGE = 'ts'
/** Each import specifier this package's own guides may resolve against. */
const MODULES = Object.freeze({ '@orkestrel/workspace': 'src/core', '@src/core': 'src/core' })
/**
 * Declarations deliberately kept out of the barrel, as `computeSymbolKey` strings.
 *
 * A class that one-class-per-file evicted from its single consumer cannot become a
 * local, so it stays exported without being public. Naming it here is what makes that
 * intentional rather than forgotten — and the second assertion below fails when a name
 * here stops being stranded, so the list cannot rot.
 */
const INTERNAL: readonly string[] = Object.freeze([])

/** Root-level files this package's guides link to. `readInventory` walks directories only. */
const ROOT_FILES = Object.freeze(['AGENTS.md'])

const root = new URL('../', import.meta.url)
const files: Record<string, string> = {
	...readInventory(root, ['src', 'guides', 'tests'], { extensions: ['.ts', '.md'] }),
}
for (const name of ROOT_FILES) files[name] = readFileSync(new URL(name, root), 'utf8')
const manifest = parseManifest(
	requireValue(files['guides/README.md'], 'Missing file: guides/README.md'),
	'guides',
)
const sources = createSourceManager({ files, modules: MODULES })

it('manifest lists at least one guide', () => {
	expect(manifest.length).toBeGreaterThan(0)
})

for (const entry of manifest) {
	const guide = createGuide(requireValue(files[entry.spec], `Missing file: ${entry.spec}`))
	const source = createSource({ files, module: entry.source })

	describe(`${entry.concept}`, () => {
		it('uses only listed fence languages', () => {
			expect(findUnlisted(guide.fences(), FENCE_LANGUAGES)).toEqual([])
		})

		it('extracts a non-empty documented surface', () => {
			expect(guide.surface().length).toBeGreaterThan(0)
		})
		it('re-exports every direct declaration that is not named internal', () => {
			const stranded = findMissingSymbols(source.exports(), source.surface())
			expect(stranded.filter((key) => !INTERNAL.includes(key))).toEqual([])
		})
		it('names no symbol internal that the barrel already exports', () => {
			const stranded = findMissingSymbols(source.exports(), source.surface())
			expect(INTERNAL.filter((key) => !stranded.includes(key))).toEqual([])
		})
		it('re-exports only direct declarations', () => {
			expect(findMissingSymbols(source.surface(), source.exports())).toEqual([])
		})
		it('documents every barrel export', () => {
			expect(findMissingSymbols(source.surface(), guide.surface())).toEqual([])
		})
		it('documents only barrel exports', () => {
			expect(findMissingSymbols(guide.surface(), source.surface())).toEqual([])
		})

		it('exposes no hidden module-scope declarations', () => {
			expect(source.hidden().map(computeSymbolKey)).toEqual([])
		})

		for (const group of guide.methods()) {
			const members = source.methods(group.interface)
			const entity = group.interface.replace(/Interface$/, '')
			describe(`${group.interface}`, () => {
				it('documents at least one method', () => {
					expect(group.methods.length).toBeGreaterThan(0)
				})
				it('documents every interface method', () => {
					expect(findMissing(members, group.methods)).toEqual([])
				})
				it('documents no phantom method', () => {
					expect(findMissing(group.methods, members)).toEqual([])
				})
				it(`${entity} exposes no undocumented method`, () => {
					const extra =
						entity === group.interface ? [] : findMissing(source.methods(entity), group.methods)
					expect(extra).toEqual([])
				})
			})
		}

		it('documents an example for every Surface function', () => {
			const fences = guide
				.fences()
				.filter((fence) => fence.language === EXAMPLE_LANGUAGE)
				.map((fence) => fence.code)
			const names = guide
				.surface()
				.filter((symbol) => symbol.kind === 'function')
				.map((symbol) => symbol.name)
			expect(findUnexampled(names, fences, source.examples())).toEqual([])
		})

		for (const group of guide.methods()) {
			const entity = group.interface.replace(/Interface$/, '')
			describe(`${group.interface} examples`, () => {
				it('documents an example for every method', () => {
					const fences = guide
						.fences()
						.filter((fence) => fence.language === EXAMPLE_LANGUAGE)
						.map((fence) => fence.code)
					const examples =
						entity === group.interface
							? source.examples(group.interface)
							: source.examples(group.interface).concat(source.examples(entity))
					expect(findUnexampled(group.methods, fences, examples)).toEqual([])
				})
			})
		}

		it('imports only real exports in every ```ts fence', () => {
			const fences = guide.fences().filter((fence) => fence.language === EXAMPLE_LANGUAGE)
			for (const fence of fences) {
				for (const { specifier, names } of extractFenceImports(fence.code)) {
					const imported = sources.source(specifier)
					if (imported === undefined) continue
					const surface = imported.surface().map((symbol) => symbol.name)
					expect(findMissing(names, surface)).toEqual([])
				}
			}
		})

		it('resolves every relative link', () => {
			const broken = guide
				.links()
				.filter((href) => !isExternalLink(href))
				.map((href) => resolveLink(entry.spec, href))
				.filter((path) => !source.exists(path))
			expect(broken).toEqual([])
		})
		it('links only to test files that exist', () => {
			const missing = guide
				.tests()
				.map((href) => resolveLink(entry.spec, href))
				.filter((path) => !source.exists(path))
			expect(missing).toEqual([])
		})
	})
}

// The flagship fences of `guides/workspace.md` and `README.md`, transcribed and executed. The
// parity checks prove a documented name resolves; only a run proves the value a fence's comment
// claims, so a fence the code contradicts passes every check earlier in this file. Change a
// fence, change the transcription here.
describe('flagship fences', () => {
	it('files and content — derived sizes, line counts, inferred language, and arm narrowing', () => {
		const note = createFile({
			path: 'notes.md',
			content: createTextContent('# Title\nBody', inferLanguage('notes.md')),
		})

		expect(inferLanguage('notes.md')).toBe('markdown')
		expect(note.size).toBe(12)
		expect(note.lines).toBe(2)
		expect(note.state).toBe('created')
		expect(isText(note.content)).toBe(true)

		const icon = createFile({
			path: 'icon.png',
			content: createBinaryContent('AAAA', 'image/png'),
		})

		expect(isBinary(icon.content)).toBe(true)
		expect(icon.size).toBe(3)
	})

	it('editing — the ranged splice, the record batch, and the prepend and append ends', () => {
		const workspace = createWorkspace({ id: 'project' })

		workspace.write('src/main.ts', 'const answer = 41')
		expect(workspace.file('src/main.ts')?.state).toBe('created')

		workspace.write('src/main.ts', '42', rangeOf(1, 16, 1, 18))
		expect(workspace.read('src/main.ts')).toBe('const answer = 42')
		expect(workspace.file('src/main.ts')?.state).toBe('modified')

		workspace.write({ 'README.md': '# Project', 'src/util.ts': 'export {}' })
		expect(workspace.files().map((file) => file.path)).toEqual([
			'src/main.ts',
			'README.md',
			'src/util.ts',
		])

		workspace.prepend('src/main.ts', '// generated\n')
		workspace.append('src/main.ts', '\n')
		workspace.prepend({ 'README.md': '<!-- header -->\n' })

		expect(workspace.read('src/main.ts')).toBe('// generated\nconst answer = 42\n')
		expect(workspace.read('README.md')).toBe('<!-- header -->\n# Project')
	})

	it('reading and searching — read shapes, membership, hit order, and replacement tallies', () => {
		const workspace = createWorkspace()
		workspace.write({ 'a.ts': 'const x = 1\nconst y = 2', 'b.ts': 'const z = 3' })

		expect(workspace.file('a.ts')?.path).toBe('a.ts')
		expect(workspace.files().map((file) => file.path)).toEqual(['a.ts', 'b.ts'])
		expect(workspace.count).toBe(2)

		expect(workspace.read('a.ts')).toBe('const x = 1\nconst y = 2')
		expect(workspace.read('a.ts', rangeOf(1, 1, 1, 6))?.content).toBe('const')
		expect(workspace.read(['a.ts', 'missing.ts'])).toEqual({ 'a.ts': 'const x = 1\nconst y = 2' })
		expect(workspace.has('a.ts')).toBe(true)
		expect(workspace.has(['a.ts', 'b.ts'])).toBe(true)
		expect(workspace.has(['missing.ts', 'b.ts'])).toBe(false)

		expect(workspace.search('const').map((match) => [match.path, match.line])).toEqual([
			['a.ts', 1],
			['a.ts', 2],
			['b.ts', 1],
		])
		// The fence's pattern names no letter-digit pair this fixture holds. The prose's claim is
		// the literal-versus-pattern split, so one source proves it read each way.
		expect(workspace.search('[a-z]\\d', { regex: true })).toEqual([])
		expect(workspace.search('const.', { regex: true })).toHaveLength(3)
		expect(workspace.search('const.')).toEqual([])
		expect(workspace.search('CONST', { sensitive: false, limit: 2 })).toHaveLength(2)
		expect(workspace.replace('const', 'let')).toEqual({ occurrences: 3, files: 2 })
		expect(escapeRegExp('a.b')).toBe('a\\.b')
	})

	it('moving and removing — the batch answers and the serializable projection', () => {
		const workspace = createWorkspace({ id: 'project' })
		workspace.write({ 'old.ts': 'body', 'draft.md': 'notes' })

		expect(workspace.move('old.ts', 'src/new.ts')).toBe(true)
		expect(workspace.move({ 'draft.md': 'docs/draft.md' })).toBe(true)
		expect(workspace.move('ghost.ts', 'x.ts')).toBe(false)

		const snapshot = workspace.snapshot()
		expect(snapshot.id).toBe('project')
		expect(snapshot.files.map((file) => file.path)).toEqual(['src/new.ts', 'docs/draft.md'])

		expect(workspace.remove('src/new.ts')).toBe(true)
		expect(workspace.remove(['docs/draft.md', 'ghost.ts'])).toBe(false)

		workspace.clear()
		expect(workspace.count).toBe(0)
	})

	it('lifecycle — a write after destroy stores and delivers no event', () => {
		const workspace = createWorkspace()
		// The fence's claim is about what a listener sees, so an observer is attached while the
		// emitter is still live.
		const events = createRecorders<WorkspaceEventMap, 'write'>(workspace.emitter, ['write'])

		workspace.destroy()
		workspace.write('silent.txt', 'still stored')

		expect(workspace.emitter.destroyed).toBe(true)
		expect(workspace.read('silent.txt')).toBe('still stored')
		expect(events.write.count).toBe(0)
	})

	it('the registry — auto-activation, switching, and the removal answers', () => {
		const edited: string[] = []
		const manager = createWorkspaceManager({ on: { write: (file) => edited.push(file.path) } })

		const scratch = manager.add({ id: 'scratch' })
		const review = manager.add({ id: 'review' })

		expect(manager.count).toBe(2)
		expect(manager.active).toBe(scratch)
		expect(manager.workspace('review')).toBe(review)
		expect(manager.workspaces()).toEqual([scratch, review])

		expect(manager.switch('review')).toBe(review)
		expect(manager.switch('ghost')).toBeUndefined()
		expect(manager.active).toBe(review)

		expect(manager.remove('review')).toBe(true)
		expect(manager.active).toBeUndefined()
		expect(manager.remove(['scratch', 'ghost'])).toBe(false)

		manager.clear()
		expect(manager.count).toBe(0)
		// The registry's listener default reaches every workspace it creates; this fence edits none.
		expect(edited).toEqual([])
	})

	it('durability — lenient save and open, and the store round trip', async () => {
		const store = createMemoryWorkspaceStore()
		const manager = createWorkspaceManager({ store })

		const project = manager.add({ id: 'project' })
		project.write('src/main.ts', 'const answer = 42')

		expect(await manager.save('project')).toBe(true)
		expect(await manager.save('ghost')).toBe(false)

		const reader = createWorkspaceManager({ store })
		const opened = await reader.open('project')
		expect(opened?.read('src/main.ts')).toBe('const answer = 42')
		expect(await reader.open('never-saved')).toBeUndefined()

		const durable = createDatabaseWorkspaceStore()
		await durable.set(project.snapshot())
		expect(await durable.get('project')).toEqual(project.snapshot())
		await durable.delete('project')
		expect(isWorkspaceSnapshot(await durable.get('project'))).toBe(false)
	})

	it('failures — a pattern source that will not compile carries the PATTERN code', () => {
		const workspace = createWorkspace()
		let thrown: unknown

		try {
			workspace.search('(', { regex: true })
		} catch (error) {
			thrown = error
		}

		expect(isWorkspaceError(thrown)).toBe(true)
		expect(isWorkspaceError(thrown) && thrown.code).toBe('PATTERN')
	})

	it('the README example — the first add activates, the append lands, one hit comes back', () => {
		const workspaces = createWorkspaceManager()
		const workspace = workspaces.add({ id: 'project' })

		workspace.write('src/main.ts', 'export const answer = 42')
		workspace.append('src/main.ts', '\n')

		expect(workspaces.active).toBe(workspace)
		expect(workspace.read('src/main.ts')).toBe('export const answer = 42\n')
		expect(workspace.search('answer')).toEqual([
			{
				path: 'src/main.ts',
				line: 1,
				column: 14,
				length: 6,
				content: 'export const answer = 42',
			},
		])
		expect(workspace.snapshot().id).toBe('project')
	})
})
