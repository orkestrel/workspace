// The consumer-side guides-parity drop-in: runs `@orkestrel/guide`'s checks against
// this repo's own `guides/README.md` manifest. The constants that follow are this
// package's own, as is the executed section that closes the file.

import type { WorkspaceEventMap } from '@src/core'
import { GuideCommand } from '@orkestrel/guide/server'
import { readInventory } from '@orkestrel/test/server'
import { createVitest } from 'vitest/node'

/** Every fence language this package's guides are allowed to use. */
const FENCE_LANGUAGES = Object.freeze(['ts'])
/** The fence language whose blocks count as worked examples. */
const EXAMPLE_LANGUAGE = 'ts'
/** The package identity that binds its manifest, module map, and README pitch. */
const PACKAGE_NAME = '@orkestrel/workspace'
/** The one guide this package sources, whose tagline the README pitch equals. */
const GUIDE_SPEC = 'guides/workspace.md'
/** Each import specifier this package's own guides may resolve against. */
const MODULES = Object.freeze({ [PACKAGE_NAME]: 'src/core', '@src/core': 'src/core' })
/**
 * Declarations deliberately kept out of the barrel, as `computeSymbolKey` strings.
 *
 * A class that one-class-per-file evicted from its single consumer cannot become a
 * local, so it stays exported without being public. Naming it here is what makes that
 * intentional rather than forgotten — and the assertion that follows it fails when a name
 * here stops being stranded, so the list cannot rot.
 */
const INTERNAL: readonly string[] = Object.freeze([])

await new GuideCommand({
	root: new URL('../', import.meta.url),
	patterns: ['src/**/*.ts', 'tests/**/*.ts', 'guides/*.md', '*.md', 'package.json'],
	modules: MODULES,
	languages: FENCE_LANGUAGES,
	language: EXAMPLE_LANGUAGE,
	reader: readInventory,
	runner: createVitest,
}).execute(async ({ files, report, rows }) => {
	const { isRecord, parseJSON } = await import('@orkestrel/contract')
	const {
		computeSymbolKey,
		createSourceManager,
		extractFenceImports,
		findMissing,
		findMissingSymbols,
		findUnexampled,
		isExternalLink,
		resolveLink,
	} = await import('@orkestrel/guide')
	const { createRecorders, requireValue } = await import('@orkestrel/test')
	const {
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
	} = await import('@src/core')
	const { describe, expect, it } = await import('vitest')
	const sources = createSourceManager({ files, modules: MODULES })
	const own = requireValue(
		rows.find((row) => row.entry.spec === GUIDE_SPEC),
		`Missing manifest row: ${GUIDE_SPEC}`,
	)
	const manifest = parseJSON(requireValue(files['package.json'], 'Missing inventory: package.json'))
	if (!isRecord(manifest)) throw new Error('Invalid package manifest: package.json')

	it('manifest lists at least one guide', () => {
		expect(report.input).toEqual([])
		expect(rows.length).toBeGreaterThan(0)
		expect(own.entry.spec).toBe(GUIDE_SPEC)
	})

	// The example half of the equality case is silent over an empty population: with no
	// title on both sides `findDrift` compares no pair and the case passes on the summaries
	// alone. This pins the population this repository's own guide contributes, so removing
	// every `@example` title reddens the suite instead of quietly retiring half the gate.
	// The failure names both title sets, because a pin reporting only its own emptiness
	// leaves the reader to work out which side dropped the title.
	it('pairs at least one example title across the guide and the source', () => {
		expect(report.examples.titles.filter((finding) => finding.spec === GUIDE_SPEC)).toEqual([])
	})

	// The README's pitch and the guide's tagline are one text, each read as the blockquote
	// under its file's H1. `README.md` is outside the concept index, so the reader is
	// applied to it directly rather than through a manifest row. Each side is guarded
	// against `undefined` first, so a file that lost its blockquote reports that rather
	// than reporting two absences as agreement.
	it('opens the README with the guide tagline', () => {
		expect(manifest.name).toBe(PACKAGE_NAME)
		expect(report.pitch).toEqual([])
	})

	for (const { entry, guide, source } of rows) {
		describe(`${entry.concept}`, () => {
			it('uses only listed fence languages', () => {
				expect(report.fences.filter((finding) => finding.spec === entry.spec)).toEqual([])
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
				const members = source.methods(group.interface).map((method) => method.name)
				const documented = group.methods.map((method) => method.name)
				const entity = group.interface.replace(/Interface$/, '')
				describe(`${group.interface}`, () => {
					it('documents at least one method', () => {
						expect(group.methods.length).toBeGreaterThan(0)
					})
					it('documents every interface method', () => {
						expect(findMissing(members, documented)).toEqual([])
					})
					it('documents no phantom method', () => {
						expect(findMissing(documented, members)).toEqual([])
					})
					it(`${entity} exposes no undocumented method`, () => {
						const extra =
							entity === group.interface
								? []
								: findMissing(
										source.methods(entity).map((method) => method.name),
										documented,
									)
						expect(extra).toEqual([])
					})
				})
			}

			// The equality gate: a `Summary` cell against its export's description paragraph, a
			// titled fence against the `@example` of that title. `findDrift` owns the comparison
			// and names both sides; converge the two sides with `npm run docs`, never by
			// weakening this assertion. `findDrift` pairs an example only where a title is
			// present on both sides, so an untitled `@example` block is outside this case. Each
			// collected line is the spec, the key, and each side's text or `absent` — the same
			// worklist `npm run docs` prints, so a failure here is read the way that command's
			// output is.
			it('keeps every compared summary and example equal to its source', () => {
				expect(report.drift.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})

			it('documents an example for every Surface function', () => {
				expect(report.examples.functions.filter((finding) => finding.spec === entry.spec)).toEqual(
					[],
				)
			})

			for (const group of guide.methods()) {
				const entity = group.interface.replace(/Interface$/, '')
				const documented = group.methods.map((method) => method.name)
				const examples =
					entity === group.interface
						? source.examples(group.interface).map((example) => example.name)
						: source
								.examples(group.interface)
								.map((example) => example.name)
								.concat(source.examples(entity).map((example) => example.name))
				describe(`${group.interface} examples`, () => {
					it('documents an example for every method', () => {
						const fences = guide
							.fences()
							.filter((fence) => fence.language === EXAMPLE_LANGUAGE)
							.map((fence) => fence.code)
						expect(findUnexampled(documented, fences, examples)).toEqual([])
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
})
