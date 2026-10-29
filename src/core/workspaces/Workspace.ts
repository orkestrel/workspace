import type { EmitterInterface } from '@orkestrel/emitter'
import type {
	FileInterface,
	Range,
	ReadResult,
	ReplaceResult,
	SearchMatch,
	SearchOptions,
	WorkspaceEventMap,
	WorkspaceInterface,
	WorkspaceOptions,
	WorkspaceSnapshot,
} from '../types.js'
import { isArray, isRecord } from '@orkestrel/contract'
import { Emitter } from '@orkestrel/emitter'
import { WorkspaceError } from '../errors.js'
import { createFile } from '../factories.js'
import {
	clampRange,
	escapeRegExp,
	inferLanguage,
	isText,
	isValidRange,
	sliceRange,
	spliceRange,
} from '../helpers.js'

/**
 * Implements `WorkspaceInterface` over one insertion-ordered path map the instance owns,
 * projecting fresh arrays on every read.
 *
 * Whole-file edits create text files, ranged edits operate only on existing text files, and
 * binary files remain available through construction-time hydration. Mutations emit after the
 * file map has changed.
 *
 * @example
 * ```ts
 * import { Workspace } from '@orkestrel/workspace'
 *
 * const workspace = new Workspace()
 * workspace.write('notes.txt', 'hello')
 * workspace.append('notes.txt', ' world')
 * workspace.read('notes.txt') // 'hello world'
 * ```
 */
export class Workspace implements WorkspaceInterface {
	readonly #id: string
	readonly #files = new Map<string, FileInterface>()
	readonly #emitter: Emitter<WorkspaceEventMap>

	/**
	 * Creates a workspace.
	 *
	 * @param options - Optional identity, emitter configuration, and initial files
	 */
	constructor(options?: WorkspaceOptions) {
		this.#id = options?.id ?? crypto.randomUUID()
		this.#emitter = new Emitter<WorkspaceEventMap>({
			...(options?.on === undefined ? {} : { on: options.on }),
			...(options?.error === undefined ? {} : { error: options.error }),
		})
		if (options?.seed) for (const file of options.seed) this.#files.set(file.path, file)
	}

	get id(): string {
		return this.#id
	}

	get emitter(): EmitterInterface<WorkspaceEventMap> {
		return this.#emitter
	}

	get count(): number {
		return this.#files.size
	}

	file(path: string): FileInterface | undefined {
		return this.#files.get(path)
	}

	files(): readonly FileInterface[] {
		return [...this.#files.values()]
	}

	read(path: string): string | undefined
	read(path: string, range: Range): ReadResult | undefined
	read(paths: readonly string[]): Readonly<Record<string, string>>
	read(
		path: string | readonly string[],
		range?: Range,
	): string | ReadResult | undefined | Readonly<Record<string, string>> {
		if (isArray(path)) {
			const result: Record<string, string> = {}
			for (const one of path) {
				const file = this.#files.get(one)
				if (file && isText(file.content)) result[one] = file.content.text
			}
			return result
		}
		const file = this.#files.get(path)
		if (!file) return undefined
		if (!range) return isText(file.content) ? file.content.text : undefined
		if (!isText(file.content)) {
			throw new WorkspaceError('MODALITY', `Cannot read a range of a binary file: ${path}`, {
				path,
			})
		}
		return {
			content: sliceRange(file.content.text, range),
			range: clampRange(file.content.text, range),
		}
	}

	has(path: string): boolean
	has(paths: readonly string[]): boolean
	has(path: string | readonly string[]): boolean {
		if (isArray(path)) return path.every((one) => this.#files.has(one))
		return this.#files.has(path)
	}

	search(query: string, options?: SearchOptions): readonly SearchMatch[] {
		const pattern = this.#pattern(query, options)
		const limit = options?.limit
		const matches: SearchMatch[] = []
		for (const file of this.#files.values()) {
			if (limit !== undefined && matches.length >= limit) break
			if (!isText(file.content)) continue
			const lines = file.content.text.split(/\r\n|\n/)
			for (const [index, lineText] of lines.entries()) {
				if (limit !== undefined && matches.length >= limit) break
				pattern.lastIndex = 0
				for (const hit of lineText.matchAll(pattern)) {
					if (limit !== undefined && matches.length >= limit) break
					matches.push({
						path: file.path,
						line: index + 1,
						column: hit.index + 1,
						length: hit[0].length,
						content: lineText,
					})
				}
			}
		}
		return matches
	}

	replace(query: string, replacement: string, options?: SearchOptions): ReplaceResult {
		const pattern = this.#pattern(query, options)
		const limit = options?.limit
		const changes: number[] = []
		for (const [path, file] of this.#files) {
			const occurrences = changes.reduce((total, count) => total + count, 0)
			if (limit !== undefined && occurrences >= limit) break
			if (!isText(file.content)) continue
			const remaining = limit === undefined ? undefined : limit - occurrences
			pattern.lastIndex = 0
			const text = file.content.text
			const matches = Array.from(text.matchAll(pattern))
			const count = matches.filter(
				(_, index) => remaining === undefined || !(index >= remaining),
			).length
			const positions = matches.keys()
			const next = text.replace(pattern, (match) =>
				(positions.next().value ?? Number.POSITIVE_INFINITY) < count ? replacement : match,
			)
			if (count > 0) {
				changes.push(count)
				this.write(path, next)
			}
		}
		return {
			occurrences: changes.reduce((total, count) => total + count, 0),
			files: changes.length,
		}
	}

	write(path: string, content: string): void
	write(path: string, content: string, range: Range): void
	write(files: Readonly<Record<string, string>>): void
	write(path: string | Readonly<Record<string, string>>, content?: string, range?: Range): void {
		if (isRecord(path)) {
			for (const [one, text] of Object.entries(path)) this.#write(one, text)
			return
		}
		if (content === undefined) return
		if (!range) {
			this.#write(path, content)
			return
		}
		this.#splice(path, content, range)
	}

	prepend(path: string, content: string): void
	prepend(files: Readonly<Record<string, string>>): void
	prepend(path: string | Readonly<Record<string, string>>, content?: string): void {
		if (isRecord(path)) {
			for (const [one, text] of Object.entries(path)) this.#prepend(one, text)
			return
		}
		if (content === undefined) return
		this.#prepend(path, content)
	}

	append(path: string, content: string): void
	append(files: Readonly<Record<string, string>>): void
	append(path: string | Readonly<Record<string, string>>, content?: string): void {
		if (isRecord(path)) {
			for (const [one, text] of Object.entries(path)) this.#append(one, text)
			return
		}
		if (content === undefined) return
		this.#append(path, content)
	}

	move(from: string, to: string): boolean
	move(mapping: Readonly<Record<string, string>>): boolean
	move(from: string | Readonly<Record<string, string>>, to?: string): boolean {
		if (isRecord(from)) {
			return Object.entries(from).reduce(
				(moved, [one, target]) => this.#move(one, target) && moved,
				true,
			)
		}
		if (to === undefined) return false
		return this.#move(from, to)
	}

	remove(path: string): boolean
	remove(paths: readonly string[]): boolean
	remove(path: string | readonly string[]): boolean {
		if (isArray(path)) {
			return Iterator.from(path).reduce((removed, one) => this.#remove(one) && removed, true)
		}
		return this.#remove(path)
	}

	clear(): void {
		this.#files.clear()
		this.#emitter.emit('clear')
	}

	snapshot(): WorkspaceSnapshot {
		return { id: this.#id, files: this.files() }
	}

	destroy(): void {
		this.#emitter.destroy()
	}

	#write(path: string, content: string): void {
		const existing = this.#files.get(path)
		const language =
			existing && isText(existing.content) ? existing.content.language : inferLanguage(path)
		const file = createFile({
			path,
			content: { text: content, language },
			state: existing ? 'modified' : 'created',
		})
		this.#files.set(path, file)
		this.#emitter.emit('write', file)
	}

	#splice(path: string, content: string, range: Range): void {
		const existing = this.#files.get(path)
		if (!existing) {
			throw new WorkspaceError('MISSING', `Cannot splice a range of a missing file: ${path}`, {
				path,
			})
		}
		if (!isText(existing.content)) {
			throw new WorkspaceError('MODALITY', `Cannot splice a range of a binary file: ${path}`, {
				path,
			})
		}
		if (!isValidRange(range)) {
			throw new WorkspaceError('RANGE', `Invalid range for file: ${path}`, { path, range })
		}
		const file = createFile({
			path,
			content: {
				text: spliceRange(existing.content.text, range, content),
				language: existing.content.language,
			},
			state: 'modified',
		})
		this.#files.set(path, file)
		this.#emitter.emit('write', file)
	}

	#prepend(path: string, content: string): void {
		const existing = this.#files.get(path)
		if (existing === undefined) {
			this.#write(path, content)
			return
		}
		if (!isText(existing.content)) {
			throw new WorkspaceError('MODALITY', `Cannot prepend text to a binary file: ${path}`, {
				path,
			})
		}
		this.#write(path, content + existing.content.text)
	}

	#append(path: string, content: string): void {
		const existing = this.#files.get(path)
		if (existing === undefined) {
			this.#write(path, content)
			return
		}
		if (!isText(existing.content)) {
			throw new WorkspaceError('MODALITY', `Cannot append text to a binary file: ${path}`, {
				path,
			})
		}
		this.#write(path, existing.content.text + content)
	}

	#move(from: string, to: string): boolean {
		if (from === to) return false
		const file = this.#files.get(from)
		if (!file) return false
		const moved = createFile({ path: to, content: file.content, state: 'modified' })
		const entries = [...this.#files]
		this.#files.clear()
		for (const [path, current] of entries) {
			if (path === from) this.#files.set(to, moved)
			else if (path !== to) this.#files.set(path, current)
		}
		this.#emitter.emit('move', from, to)
		return true
	}

	#remove(path: string): boolean {
		const removed = this.#files.delete(path)
		if (removed) this.#emitter.emit('remove', path)
		return removed
	}

	#pattern(query: string, options?: SearchOptions): RegExp {
		const source = options?.regex === true ? query : escapeRegExp(query)
		const flags = options?.sensitive === false ? 'gi' : 'g'
		try {
			return new RegExp(source, flags)
		} catch {
			throw new WorkspaceError('PATTERN', `Invalid search pattern: ${query}`, { query })
		}
	}
}
