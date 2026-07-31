import type { Range } from '@src/core'
import {
	createBinaryContent,
	createFile,
	createWorkspace,
	isText,
	isWorkspaceError,
	Workspace,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import { createErrorRecorder, recordEmitterEvents } from '../../../setup.js'

// The in-memory Workspace edit surface (AGENTS §16 — real data, no mocks). Every edit
// replaces the immutable File at a path (transitioning created → modified); the modality
// matrix governs text-only ops on a binary file; the emitter observes each mutation after
// it completes. The edit surface itself only ever mints TEXT Files, so a genuine binary File
// (built with the public createFile + createBinaryContent) is placed through the Workspace's
// optional construction-time seed — the same hydration seam a future FileStore uses — never
// a stub.

// Build a 1-based range from line/column pairs.
function range(startLine: number, startColumn: number, endLine: number, endColumn: number): Range {
	return {
		start: { line: startLine, column: startColumn },
		end: { line: endLine, column: endColumn },
	}
}

// A workspace seeded with one real binary (image) File at `icon.png` (base64 'AAAA' → 3 decoded
// bytes). Built via the public createFile / createBinaryContent, placed through the
// construction-time seed (the only way to seat a non-text file — the edit surface mints
// only text). Returns the live Workspace so the modality rules run against genuine content.
function imageWorkspace(): Workspace {
	const image = createFile({ path: 'icon.png', content: createBinaryContent('AAAA', 'image/png') })
	return new Workspace(undefined, [['icon.png', image]])
}

describe('Workspace — write / read round-trip + state transition', () => {
	it('writes a new text file as created and reads it back', () => {
		const workspace = createWorkspace()

		workspace.write('src/main.ts', 'const x = 1')

		expect(workspace.read('src/main.ts')).toBe('const x = 1')
		expect(workspace.file('src/main.ts')?.state).toBe('created')
		expect(workspace.count).toBe(1)
	})

	it('transitions an existing file to modified on a re-write', () => {
		const workspace = createWorkspace()

		workspace.write('a.ts', 'first')
		expect(workspace.file('a.ts')?.state).toBe('created')
		workspace.write('a.ts', 'second')

		expect(workspace.read('a.ts')).toBe('second')
		expect(workspace.file('a.ts')?.state).toBe('modified')
		expect(workspace.count).toBe(1)
	})

	it('infers the language from the path on a fresh write, preserving it on re-write', () => {
		const workspace = createWorkspace()

		workspace.write('main.ts', 'x')
		const created = workspace.file('main.ts')
		expect(created !== undefined && isText(created.content) && created.content.language).toBe(
			'typescript',
		)

		workspace.write('main.ts', 'y')
		const modified = workspace.file('main.ts')
		expect(modified !== undefined && isText(modified.content) && modified.content.language).toBe(
			'typescript',
		)
	})

	it('mints a NEW immutable File on each edit (never mutates in place)', () => {
		const workspace = createWorkspace()

		workspace.write('a.ts', 'one')
		const before = workspace.file('a.ts')
		workspace.write('a.ts', 'two')
		const after = workspace.file('a.ts')

		expect(before).not.toBe(after)
		expect(before !== undefined && isText(before.content) && before.content.text).toBe('one')
		expect(after !== undefined && isText(after.content) && after.content.text).toBe('two')
	})

	it('reads an absent path as undefined', () => {
		expect(createWorkspace().read('missing.ts')).toBeUndefined()
	})
})

describe('Workspace — ranged write (splice) + clamping', () => {
	it('splices a range of an existing text file and marks it modified', () => {
		const workspace = createWorkspace()
		workspace.write('a.ts', 'const x = 1')

		workspace.write('a.ts', '2', range(1, 11, 1, 12)) // replace the '1'

		expect(workspace.read('a.ts')).toBe('const x = 2')
		expect(workspace.file('a.ts')?.state).toBe('modified')
	})

	it('clamps a past-the-end range to the content', () => {
		const workspace = createWorkspace()
		workspace.write('a.ts', 'abc')

		workspace.write('a.ts', 'XYZ', range(1, 2, 9, 9)) // from column 2 to the end

		expect(workspace.read('a.ts')).toBe('aXYZ')
	})

	it('reads a clamped range, reporting the actual span applied', () => {
		const workspace = createWorkspace()
		workspace.write('a.ts', 'hello\nworld')

		const result = workspace.read('a.ts', range(1, 1, 1, 6))

		expect(result).toEqual({ content: 'hello', range: range(1, 1, 1, 6) })
	})

	it('reports the trimmed range when the read reaches past the end', () => {
		const workspace = createWorkspace()
		workspace.write('a.ts', 'ab')

		const result = workspace.read('a.ts', range(1, 1, 9, 9))

		expect(result).toEqual({ content: 'ab', range: range(1, 1, 1, 3) })
	})

	it('throws RANGE on a structurally invalid ranged write (inverted / sub-1)', () => {
		const workspace = createWorkspace()
		workspace.write('a.ts', 'abc')

		expect(() => workspace.write('a.ts', 'x', range(2, 1, 1, 1))).toThrowError(
			expect.objectContaining({ name: 'WorkspaceError', code: 'RANGE' }),
		)
		expect(() => workspace.write('a.ts', 'x', range(0, 1, 1, 1))).toThrowError(
			expect.objectContaining({ code: 'RANGE' }),
		)
	})

	it('throws MODALITY on a ranged write to an absent path (no text file to splice)', () => {
		expect(() => createWorkspace().write('missing.ts', 'x', range(1, 1, 1, 1))).toThrowError(
			expect.objectContaining({ code: 'MODALITY' }),
		)
	})
})

describe('Workspace — prepend / append (incl. create-on-absent)', () => {
	it('prepends and appends to an existing file', () => {
		const workspace = createWorkspace()
		workspace.write('a.ts', 'middle')

		workspace.prepend('a.ts', 'start ')
		workspace.append('a.ts', ' end')

		expect(workspace.read('a.ts')).toBe('start middle end')
		expect(workspace.file('a.ts')?.state).toBe('modified')
	})

	it('creates the file on prepend / append to an absent path (missing treated as empty)', () => {
		const workspace = createWorkspace()

		workspace.prepend('p.ts', 'hello')
		workspace.append('q.ts', 'world')

		expect(workspace.read('p.ts')).toBe('hello')
		expect(workspace.read('q.ts')).toBe('world')
		expect(workspace.file('p.ts')?.state).toBe('created')
		expect(workspace.file('q.ts')?.state).toBe('created')
	})

	it('applies a record batch of prepends / appends per entry', () => {
		const workspace = createWorkspace()
		workspace.write({ 'a.ts': 'A', 'b.ts': 'B' })

		workspace.prepend({ 'a.ts': '1', 'b.ts': '2' })

		expect(workspace.read('a.ts')).toBe('1A')
		expect(workspace.read('b.ts')).toBe('2B')
	})
})

describe('Workspace — batch write / read / has', () => {
	it('writes a record batch, one File per entry', () => {
		const workspace = createWorkspace()

		workspace.write({ 'a.ts': 'aaa', 'b.ts': 'bbb' })

		expect(workspace.count).toBe(2)
		expect(workspace.read(['a.ts', 'b.ts'])).toEqual({ 'a.ts': 'aaa', 'b.ts': 'bbb' })
	})

	it('omits absent paths from a batch read', () => {
		const workspace = createWorkspace()
		workspace.write('a.ts', 'x')

		expect(workspace.read(['a.ts', 'missing.ts'])).toEqual({ 'a.ts': 'x' })
	})

	it('reports membership for a single path and any-present for a batch', () => {
		const workspace = createWorkspace()
		workspace.write('a.ts', 'x')

		expect(workspace.has('a.ts')).toBe(true)
		expect(workspace.has('missing.ts')).toBe(false)
		expect(workspace.has(['a.ts', 'missing.ts'])).toBe(true) // any present
		expect(workspace.has(['missing.ts', 'gone.ts'])).toBe(false)
	})
})

describe('Workspace — search', () => {
	it('finds literal substring matches with 1-based line/column + the full line', () => {
		const workspace = createWorkspace()
		workspace.write('a.ts', 'const x = 1\nconst y = 2')

		const matches = workspace.search('const')

		expect(matches).toEqual([
			{ path: 'a.ts', line: 1, column: 1, length: 5, content: 'const x = 1' },
			{ path: 'a.ts', line: 2, column: 1, length: 5, content: 'const y = 2' },
		])
	})

	it('treats the query as a regex when regex:true', () => {
		const workspace = createWorkspace()
		workspace.write('a.ts', 'a1 b2 c3')

		const matches = workspace.search('[a-z]\\d', { regex: true })

		expect(matches.map((m) => m.content)).toEqual(['a1 b2 c3', 'a1 b2 c3', 'a1 b2 c3'])
		expect(matches.map((m) => m.column)).toEqual([1, 4, 7])
	})

	it('is case-sensitive by default and case-insensitive with exact:false', () => {
		const workspace = createWorkspace()
		workspace.write('a.ts', 'Hello hello HELLO')

		expect(workspace.search('hello')).toHaveLength(1)
		expect(workspace.search('hello', { exact: false })).toHaveLength(3)
	})

	it('stops at the limit across files in insertion order', () => {
		const workspace = createWorkspace()
		workspace.write('a.ts', 'x x x')
		workspace.write('b.ts', 'x x')

		const matches = workspace.search('x', { limit: 4 })

		expect(matches).toHaveLength(4)
		expect(matches.map((m) => m.path)).toEqual(['a.ts', 'a.ts', 'a.ts', 'b.ts'])
	})

	it('throws PATTERN on an invalid regex', () => {
		expect(() => createWorkspace().search('(', { regex: true })).toThrowError(
			expect.objectContaining({ name: 'WorkspaceError', code: 'PATTERN' }),
		)
	})

	it('terminates on a zero-width regex match without looping (the lastIndex guard)', () => {
		const workspace = createWorkspace()
		workspace.write('a.ts', 'baa')

		// `a*` can match the empty string — the per-line scan must advance past a
		// zero-width hit (bumping lastIndex) instead of re-matching the same index forever.
		const matches = workspace.search('a*', { regex: true })

		expect(matches.map((match) => match.column)).toEqual([1, 2, 4])
		expect(matches.map((match) => match.length)).toEqual([0, 2, 0])
	})

	it('returns no matches over an empty workspace', () => {
		expect(createWorkspace().search('anything')).toEqual([])
	})
})

describe('Workspace — replace', () => {
	it('replaces across every text file and tallies occurrences + files changed', () => {
		const workspace = createWorkspace()
		workspace.write('a.ts', 'const x = 1\nconst y = 2')
		workspace.write('b.ts', 'const z = 3')
		workspace.write('c.ts', 'let w = 4') // no match

		const result = workspace.replace('const', 'let')

		expect(result).toEqual({ query: 'const', replaced: 3, files: 2 })
		expect(workspace.read('a.ts')).toBe('let x = 1\nlet y = 2')
		expect(workspace.read('b.ts')).toBe('let z = 3')
		expect(workspace.read('c.ts')).toBe('let w = 4') // untouched
	})

	it('marks each changed file modified and fires one write event per changed file', () => {
		const workspace = createWorkspace()
		workspace.write('a.ts', 'aa')
		workspace.write('b.ts', 'aa')
		const events = recordEmitterEvents(workspace.emitter, ['write'])

		const result = workspace.replace('a', 'b')

		expect(result).toEqual({ query: 'a', replaced: 4, files: 2 })
		expect(events.write.count).toBe(2) // one per changed file, not per occurrence
		expect(workspace.file('a.ts')?.state).toBe('modified')
	})

	it('honors a regex replacement and a limit', () => {
		const workspace = createWorkspace()
		workspace.write('a.ts', 'a1 a2 a3')

		const result = workspace.replace('a\\d', 'X', { regex: true, limit: 2 })

		expect(result.replaced).toBe(2)
		expect(workspace.read('a.ts')).toBe('X X a3')
	})

	it('throws PATTERN on an invalid regex', () => {
		const workspace = createWorkspace()
		workspace.write('a.ts', 'x')

		expect(() => workspace.replace('(', 'y', { regex: true })).toThrowError(
			expect.objectContaining({ code: 'PATTERN' }),
		)
	})
})

describe('Workspace — move', () => {
	it('re-keys a file to a new path and marks it modified', () => {
		const workspace = createWorkspace()
		workspace.write('old.ts', 'body')

		expect(workspace.move('old.ts', 'new.ts')).toBe(true)
		expect(workspace.has('old.ts')).toBe(false)
		expect(workspace.read('new.ts')).toBe('body')
		expect(workspace.file('new.ts')?.path).toBe('new.ts')
		expect(workspace.file('new.ts')?.state).toBe('modified')
	})

	it('overwrites an occupied target (last write wins, no conflict error)', () => {
		const workspace = createWorkspace()
		workspace.write('a.ts', 'from')
		workspace.write('b.ts', 'to')

		expect(workspace.move('a.ts', 'b.ts')).toBe(true)
		expect(workspace.read('b.ts')).toBe('from')
		expect(workspace.count).toBe(1)
	})

	it('returns false for an absent source', () => {
		expect(createWorkspace().move('missing.ts', 'x.ts')).toBe(false)
	})

	it('applies a mapping batch, true when any moved', () => {
		const workspace = createWorkspace()
		workspace.write('a.ts', 'A')
		workspace.write('b.ts', 'B')

		expect(workspace.move({ 'a.ts': 'x.ts', 'b.ts': 'y.ts' })).toBe(true)
		expect(workspace.read('x.ts')).toBe('A')
		expect(workspace.read('y.ts')).toBe('B')

		expect(workspace.move({ 'gone.ts': 'z.ts' })).toBe(false) // none moved
	})
})

describe('Workspace — remove / clear', () => {
	it('removes a single path, returning whether one was dropped', () => {
		const workspace = createWorkspace()
		workspace.write('a.ts', 'x')

		expect(workspace.remove('a.ts')).toBe(true)
		expect(workspace.has('a.ts')).toBe(false)
		expect(workspace.remove('a.ts')).toBe(false) // already gone
	})

	it('removes a batch, true when any was removed', () => {
		const workspace = createWorkspace()
		workspace.write({ 'a.ts': 'A', 'b.ts': 'B' })

		expect(workspace.remove(['a.ts', 'missing.ts'])).toBe(true) // a.ts dropped
		expect(workspace.count).toBe(1)
		expect(workspace.remove(['gone.ts'])).toBe(false)
	})

	it('empties the workspace with remove() (no argument)', () => {
		const workspace = createWorkspace()
		workspace.write({ 'a.ts': 'A', 'b.ts': 'B' })

		workspace.remove()

		expect(workspace.count).toBe(0)
	})

	it('empties the workspace with clear()', () => {
		const workspace = createWorkspace()
		workspace.write({ 'a.ts': 'A', 'b.ts': 'B' })

		workspace.clear()

		expect(workspace.count).toBe(0)
	})
})

describe('Workspace — count + insertion order', () => {
	it('tracks count and lists files in insertion order', () => {
		const workspace = createWorkspace()

		workspace.write('c.ts', '3')
		workspace.write('a.ts', '1')
		workspace.write('b.ts', '2')

		expect(workspace.count).toBe(3)
		expect(workspace.files().map((file) => file.path)).toEqual(['c.ts', 'a.ts', 'b.ts'])
	})

	it('preserves the insertion slot of a file on re-write', () => {
		const workspace = createWorkspace()
		workspace.write('a.ts', '1')
		workspace.write('b.ts', '2')

		workspace.write('a.ts', '1-edited') // re-write keeps its original slot

		expect(workspace.files().map((file) => file.path)).toEqual(['a.ts', 'b.ts'])
	})
})

describe('Workspace — modality matrix (text-only ops on an image file)', () => {
	it('returns undefined for a plain read of an image file', () => {
		const workspace = imageWorkspace()

		expect(workspace.read('icon.png')).toBeUndefined()
	})

	it('throws MODALITY for a ranged read of an image file', () => {
		const workspace = imageWorkspace()

		expect(() => workspace.read('icon.png', range(1, 1, 1, 2))).toThrowError(
			expect.objectContaining({ code: 'MODALITY' }),
		)
	})

	it('throws MODALITY for a ranged write to an image file', () => {
		const workspace = imageWorkspace()

		expect(() => workspace.write('icon.png', 'x', range(1, 1, 1, 2))).toThrowError(
			expect.objectContaining({ code: 'MODALITY' }),
		)
	})

	it('throws MODALITY for prepend / append on an image file', () => {
		const workspace = imageWorkspace()

		expect(() => workspace.prepend('icon.png', 'x')).toThrowError(
			expect.objectContaining({ code: 'MODALITY' }),
		)
		expect(() => workspace.append('icon.png', 'x')).toThrowError(
			expect.objectContaining({ code: 'MODALITY' }),
		)
	})

	it('skips image files in search and replace', () => {
		const workspace = imageWorkspace()
		workspace.write('a.ts', 'AAAA') // a text file with the same content as the image base64

		expect(workspace.search('AAAA')).toHaveLength(1) // only the text file
		expect(workspace.replace('AAAA', 'x')).toEqual({ query: 'AAAA', replaced: 1, files: 1 })
		expect(workspace.read('icon.png')).toBeUndefined() // image untouched
	})

	it('omits an image path from a batch read', () => {
		const workspace = imageWorkspace()
		workspace.write('a.ts', 'text')

		expect(workspace.read(['a.ts', 'icon.png'])).toEqual({ 'a.ts': 'text' })
	})

	it('retypes a binary path to a text file on a whole-file string write (a deliberate replacement)', () => {
		const workspace = imageWorkspace()

		workspace.write('icon.png', 'now text')

		expect(workspace.read('icon.png')).toBe('now text')
		const retyped = workspace.file('icon.png')
		expect(retyped !== undefined && isText(retyped.content)).toBe(true)
		expect(workspace.file('icon.png')?.state).toBe('modified') // it existed → modified
	})
})

describe('Workspace — emitter events + listener isolation', () => {
	it('emits write / remove / move / clear after the mutation', () => {
		const workspace = createWorkspace()
		const events = recordEmitterEvents(workspace.emitter, ['write', 'remove', 'move', 'clear'])

		workspace.write('a.ts', 'x') // write
		workspace.move('a.ts', 'b.ts') // move
		workspace.remove('b.ts') // remove
		workspace.write('c.ts', 'y')
		workspace.clear() // clear

		expect(events.write.calls.map(([file]) => file.path)).toEqual(['a.ts', 'c.ts'])
		expect(events.move.calls).toEqual([[{ from: 'a.ts', to: 'b.ts' }]])
		expect(events.remove.calls).toEqual([['b.ts']])
		expect(events.clear.count).toBe(1)
	})

	it('emits clear from remove() (no argument), the canonical emptied signal', () => {
		const workspace = createWorkspace()
		workspace.write('a.ts', 'x')
		const events = recordEmitterEvents(workspace.emitter, ['clear', 'remove'])

		workspace.remove()

		expect(events.clear.count).toBe(1)
		expect(events.remove.count).toBe(0) // remove() emits clear, not per-path remove
	})

	it('does not emit remove when the path was absent', () => {
		const workspace = createWorkspace()
		const events = recordEmitterEvents(workspace.emitter, ['remove'])

		expect(workspace.remove('missing.ts')).toBe(false)

		expect(events.remove.count).toBe(0)
	})

	it('isolates a throwing listener, routing the throw to the error handler', () => {
		const errors = createErrorRecorder()
		const workspace = createWorkspace({
			on: {
				write: () => {
					throw new Error('listener boom')
				},
			},
			error: (error, event) => errors.handler(error, event),
		})

		// The throw is isolated — the mutation still lands and the write call returns normally.
		expect(() => workspace.write('a.ts', 'x')).not.toThrow()
		expect(workspace.read('a.ts')).toBe('x')
		expect(errors.count).toBe(1)
		expect(errors.calls[0]?.[1]).toBe('write')
	})
})

describe('isWorkspaceError', () => {
	it('narrows a thrown WorkspaceError and rejects other values', () => {
		const workspace = createWorkspace()
		// Capture the thrown value WITHOUT a conditional expect — run the throwing call and
		// keep whatever it threw, then assert unconditionally.
		let thrown: unknown
		try {
			workspace.search('(', { regex: true })
		} catch (error) {
			thrown = error
		}

		expect(isWorkspaceError(thrown)).toBe(true)
		expect(isWorkspaceError(thrown) && thrown.code).toBe('PATTERN')
		expect(isWorkspaceError(new Error('plain'))).toBe(false)
		expect(isWorkspaceError('PATTERN')).toBe(false)
	})
})

describe('Workspace — id (minted or supplied)', () => {
	it('mints a fresh id when none is supplied', () => {
		const a = createWorkspace()
		const b = createWorkspace()

		expect(typeof a.id).toBe('string')
		expect(a.id.length).toBeGreaterThan(0)
		expect(a.id).not.toBe(b.id) // each mint is distinct
	})

	it('uses the supplied id from options (constructor or factory)', () => {
		expect(createWorkspace({ id: 'fixed' }).id).toBe('fixed')
		// The id is honored alongside the optional construction-time seed.
		const seeded = new Workspace({ id: 'seeded' }, [
			['a.ts', createFile({ path: 'a.ts', content: { text: 'x', language: 'typescript' } })],
		])
		expect(seeded.id).toBe('seeded')
	})
})

describe('Workspace — construction-time seed (the hydration seam)', () => {
	it('seats pre-built files (incl. a non-text binary) without emitting', () => {
		const image = createFile({
			path: 'icon.png',
			content: createBinaryContent('AAAA', 'image/png'),
		})
		const text = createFile({
			path: 'a.ts',
			content: { text: 'x', language: 'typescript' },
		})
		const events = recordEmitterEvents(new Workspace().emitter, ['write'])
		const workspace = new Workspace(undefined, [
			['icon.png', image],
			['a.ts', text],
		])

		expect(workspace.count).toBe(2)
		expect(workspace.files().map((file) => file.path)).toEqual(['icon.png', 'a.ts'])
		const seededImage = workspace.file('icon.png')
		expect(seededImage !== undefined && !isText(seededImage.content)).toBe(true)
		expect(workspace.read('a.ts')).toBe('x')
		expect(events.write.count).toBe(0) // seeding is silent — nothing was edited
	})
})
