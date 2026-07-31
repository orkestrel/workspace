import type { EmitterInterface } from '@orkestrel/emitter'
import type {
	FileInterface,
	Range,
	ReadResult,
	ReplaceOptions,
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
 * A mutable path-keyed editing surface over immutable files.
 *
 * Whole-file edits create text files, ranged edits operate only on existing text files, and
 * binary files remain available through construction-time hydration. Mutations emit after the
 * registry has changed.
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
	 * Create a workspace.
	 *
	 * @param options - Optional identity and emitter configuration
	 * @param seed - Initial path-to-file entries placed without emitting
	 */
	constructor(options?: WorkspaceOptions, seed?: Iterable<readonly [string, FileInterface]>) {
		this.#id = options?.id ?? crypto.randomUUID()
		this.#emitter = new Emitter<WorkspaceEventMap>({
			...(options?.on === undefined ? {} : { on: options.on }),
			...(options?.error === undefined ? {} : { error: options.error }),
		})
		if (seed) for (const [path, file] of seed) this.#files.set(path, file)
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
		if (isArray(path)) return path.some((one) => this.#files.has(one))
		return this.#files.has(path)
	}

	search(query: string, options?: SearchOptions): readonly SearchMatch[] {
		const pattern = this.#pattern(query, options)
		const limit = options?.limit
		const matches: SearchMatch[] = []
		for (const file of this.#files.values()) {
			if (limit !== undefined && matches.length >= limit) break
			if (!isText(file.content)) continue
			const lines = file.content.text.split('\n')
			for (let index = 0; index < lines.length; index += 1) {
				if (limit !== undefined && matches.length >= limit) break
				const lineText = lines[index] ?? ''
				pattern.lastIndex = 0
				let hit = pattern.exec(lineText)
				while (hit !== null) {
					if (limit !== undefined && matches.length >= limit) break
					matches.push({
						path: file.path,
						line: index + 1,
						column: hit.index + 1,
						length: hit[0].length,
						content: lineText,
					})
					if (hit[0].length === 0) pattern.lastIndex += 1
					hit = pattern.exec(lineText)
				}
			}
		}
		return matches
	}

	replace(query: string, replacement: string, options?: ReplaceOptions): ReplaceResult {
		const pattern = this.#pattern(query, options)
		const limit = options?.limit
		let replaced = 0
		let files = 0
		for (const [path, file] of this.#files) {
			if (limit !== undefined && replaced >= limit) break
			if (!isText(file.content)) continue
			const remaining = limit === undefined ? undefined : limit - replaced
			let count = 0
			pattern.lastIndex = 0
			const next = file.content.text.replace(pattern, (match) => {
				if (remaining !== undefined && count >= remaining) return match
				count += 1
				return replacement
			})
			if (count > 0) {
				replaced += count
				files += 1
				this.write(path, next)
			}
		}
		return { query, replaced, files }
	}

	write(path: string, content: string): void
	write(path: string, content: string, range: Range): void
	write(files: Readonly<Record<string, string>>): void
	write(path: string | Readonly<Record<string, string>>, content?: string, range?: Range): void {
		if (isRecord(path)) {
			for (const [one, text] of Object.entries(path)) this.#write(one, text)
			return
		}
		const text = content ?? ''
		if (!range) {
			this.#write(path, text)
			return
		}
		this.#splice(path, text, range)
	}

	prepend(path: string, content: string): void
	prepend(files: Readonly<Record<string, string>>): void
	prepend(path: string | Readonly<Record<string, string>>, content?: string): void {
		if (isRecord(path)) {
			for (const [one, text] of Object.entries(path)) this.#prepend(one, text)
			return
		}
		this.#prepend(path, content ?? '')
	}

	append(path: string, content: string): void
	append(files: Readonly<Record<string, string>>): void
	append(path: string | Readonly<Record<string, string>>, content?: string): void {
		if (isRecord(path)) {
			for (const [one, text] of Object.entries(path)) this.#append(one, text)
			return
		}
		this.#append(path, content ?? '')
	}

	move(from: string, to: string): boolean
	move(mapping: Readonly<Record<string, string>>): boolean
	move(from: string | Readonly<Record<string, string>>, to?: string): boolean {
		if (isRecord(from)) {
			let moved = false
			for (const [one, target] of Object.entries(from)) {
				if (this.#move(one, target)) moved = true
			}
			return moved
		}
		return this.#move(from, to ?? '')
	}

	remove(): void
	remove(path: string): boolean
	remove(paths: readonly string[]): boolean
	remove(path?: string | readonly string[]): boolean | void {
		if (path === undefined) {
			this.#files.clear()
			this.#emitter.emit('clear')
			return
		}
		if (isArray(path)) {
			let removed = false
			for (const one of path) {
				if (this.#remove(one)) removed = true
			}
			return removed
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
		if (!existing || !isText(existing.content)) {
			throw new WorkspaceError('MODALITY', `Cannot splice a range of a non-text file: ${path}`, {
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
		this.#write(path, content + this.#text(path, 'prepend'))
	}

	#append(path: string, content: string): void {
		this.#write(path, this.#text(path, 'append') + content)
	}

	#text(path: string, operation: string): string {
		const existing = this.#files.get(path)
		if (!existing) return ''
		if (!isText(existing.content)) {
			throw new WorkspaceError('MODALITY', `Cannot ${operation} text to a binary file: ${path}`, {
				path,
			})
		}
		return existing.content.text
	}

	#move(from: string, to: string): boolean {
		const file = this.#files.get(from)
		if (!file) return false
		const moved = createFile({ path: to, content: file.content, state: 'modified' })
		this.#files.delete(from)
		this.#files.set(to, moved)
		this.#emitter.emit('move', { from, to })
		return true
	}

	#remove(path: string): boolean {
		const removed = this.#files.delete(path)
		if (removed) this.#emitter.emit('remove', path)
		return removed
	}

	#pattern(query: string, options?: SearchOptions | ReplaceOptions): RegExp {
		const source = options?.regex === true ? query : escapeRegExp(query)
		const flags = options?.exact === false ? 'gi' : 'g'
		try {
			return new RegExp(source, flags)
		} catch {
			throw new WorkspaceError('PATTERN', `Invalid search pattern: ${query}`, { query })
		}
	}
}
