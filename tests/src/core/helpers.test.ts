import type { BinaryMIME, FileState } from '@src/core'
import {
	clampPosition,
	clampRange,
	computeSize,
	countLines,
	createBinaryContent,
	createFile,
	createTextContent,
	decodedSize,
	escapeRegExp,
	EXTENSION_LANGUAGES,
	inferLanguage,
	isBinary,
	isFile,
	isText,
	isValidRange,
	isWorkspaceSnapshot,
	offsetAt,
	rangeOf,
	sliceRange,
	spliceRange,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import { createRevokedProxy, createThrowingGetterRecord } from '../../setup.js'

describe('inferLanguage', () => {
	it('maps known extensions case-insensitively after the last dot', () => {
		expect(inferLanguage('src/main.ts')).toBe('typescript')
		expect(inferLanguage('component.vue')).toBe('vue')
		expect(inferLanguage('archive.part.JSON')).toBe('json')
		expect(inferLanguage('README.md')).toBe('markdown')
		expect(EXTENSION_LANGUAGES.ts).toBe('typescript')
	})

	it('falls back to text for absent and unknown extensions', () => {
		expect(inferLanguage('LICENSE')).toBe('text')
		expect(inferLanguage('file.unknown')).toBe('text')
	})
})

describe('content guards', () => {
	it('distinguishes text and binary content', () => {
		const text = createTextContent('hi', 'text')
		const image = createBinaryContent('AAAA', 'image/png')
		expect(isText(text)).toBe(true)
		expect(isBinary(text)).toBe(false)
		expect(isText(image)).toBe(false)
		expect(isBinary(image)).toBe(true)
	})
})

describe('persistence guards', () => {
	it('accepts both file states and every closed binary MIME', () => {
		for (const state of ['created', 'modified'] satisfies readonly FileState[]) {
			const file = createFile({
				path: `${state}.txt`,
				content: createTextContent('x', 'text'),
				state,
			})
			expect(isFile(file)).toBe(true)
			expect(isWorkspaceSnapshot({ id: state, files: [file] })).toBe(true)
		}
		for (const mime of [
			'image/png',
			'image/jpeg',
			'image/gif',
			'image/webp',
		] satisfies readonly BinaryMIME[]) {
			const file = createFile({ path: mime, content: createBinaryContent('AA==', mime) })
			expect(isFile(file)).toBe(true)
			expect(isWorkspaceSnapshot({ id: mime, files: [file] })).toBe(true)
		}
	})

	it('rejects invalid state and MIME literals', () => {
		for (const state of ['archived', '', 'loaded', 'deleted']) {
			const file = {
				path: 'a.txt',
				content: { text: 'a', language: 'text' },
				state,
				size: 1,
				lines: 1,
			}
			expect(isFile(file)).toBe(false)
			expect(isWorkspaceSnapshot({ id: state, files: [file] })).toBe(false)
		}
		for (const mime of ['application/pdf', 'image/avif', 'arbitrary']) {
			const file = {
				path: 'a.bin',
				content: { data: 'AA==', mime },
				state: 'created',
				size: 1,
				lines: 0,
			}
			expect(isFile(file)).toBe(false)
			expect(isWorkspaceSnapshot({ id: mime, files: [file] })).toBe(false)
		}
	})

	it('keeps file and snapshot guards total for hostile property access', () => {
		const revoked = createRevokedProxy()
		expect(() => isFile(createThrowingGetterRecord('path'))).not.toThrow()
		expect(isFile(createThrowingGetterRecord('path'))).toBe(false)
		expect(() => isFile(revoked)).not.toThrow()
		expect(isFile(revoked)).toBe(false)
		expect(() => isWorkspaceSnapshot(createThrowingGetterRecord('id'))).not.toThrow()
		expect(isWorkspaceSnapshot(createThrowingGetterRecord('id'))).toBe(false)
		expect(() => isWorkspaceSnapshot(revoked)).not.toThrow()
		expect(isWorkspaceSnapshot(revoked)).toBe(false)
	})
})

describe('content derivation', () => {
	it('computes UTF-8 and decoded binary byte sizes', () => {
		expect(computeSize({ text: '', language: 'text' })).toBe(0)
		expect(computeSize({ text: 'abc', language: 'text' })).toBe(3)
		expect(computeSize({ text: 'café', language: 'text' })).toBe(5)
		expect(computeSize({ text: '😀', language: 'text' })).toBe(4)
		expect(computeSize({ data: 'AAAA', mime: 'image/png' })).toBe(3)
		expect(computeSize({ data: '', mime: 'image/png' })).toBe(0)
	})

	it('counts text lines and no binary lines', () => {
		expect(countLines({ text: '', language: 'text' })).toBe(0)
		expect(countLines({ text: 'a', language: 'text' })).toBe(1)
		expect(countLines({ text: 'a\nb\nc', language: 'text' })).toBe(3)
		expect(countLines({ text: 'a\n', language: 'text' })).toBe(2)
		expect(countLines({ text: 'a\nb\n', language: 'text' })).toBe(3)
		expect(countLines({ data: 'AAAA', mime: 'image/png' })).toBe(0)
	})

	it('handles all base64 padding cases and runtime-encoded values', () => {
		expect(decodedSize('')).toBe(0)
		expect(decodedSize('AA')).toBe(1)
		expect(decodedSize('AAA')).toBe(2)
		expect(decodedSize('AAAA')).toBe(3)
		expect(decodedSize('AAA=')).toBe(2)
		expect(decodedSize('AA==')).toBe(1)
		for (const payload of ['', 'a', 'ab', 'abc', 'abcd', 'abcde', 'abcdef']) {
			expect(decodedSize(btoa(payload))).toBe(payload.length)
		}
	})
})

describe('range helpers', () => {
	it('validates positive ordered ranges', () => {
		expect(isValidRange(rangeOf(1, 1, 2, 1))).toBe(true)
		expect(isValidRange(rangeOf(1, 1, 1, 1))).toBe(true)
		expect(isValidRange(rangeOf(1, 3, 1, 5))).toBe(true)
		expect(isValidRange(rangeOf(2, 1, 1, 1))).toBe(false)
		expect(isValidRange(rangeOf(1, 5, 1, 3))).toBe(false)
		expect(isValidRange(rangeOf(0, 1, 1, 1))).toBe(false)
		expect(isValidRange(rangeOf(1, 0, 1, 1))).toBe(false)
		expect(isValidRange(rangeOf(1, 1, 1, 0))).toBe(false)
	})

	it('clamps positions and ranges to their addressed lines', () => {
		expect(clampPosition('ab\ncd', { line: 9, column: 9 })).toEqual({ line: 2, column: 3 })
		expect(clampPosition('ab\ncd', { line: 0, column: 0 })).toEqual({ line: 1, column: 1 })
		expect(clampPosition('ab\ncdef', { line: 1, column: 99 })).toEqual({ line: 1, column: 3 })
		expect(clampRange('ab\ncd', rangeOf(1, 1, 9, 9))).toEqual(rangeOf(1, 1, 2, 3))
	})

	it('converts positions to offsets', () => {
		expect(offsetAt('ab\ncd', { line: 1, column: 1 })).toBe(0)
		expect(offsetAt('ab\ncd', { line: 1, column: 3 })).toBe(2)
		expect(offsetAt('ab\ncd', { line: 2, column: 1 })).toBe(3)
		expect(offsetAt('ab\ncd', { line: 2, column: 3 })).toBe(5)
		expect(offsetAt('ab\ncd', { line: 9, column: 9 })).toBe(5)
	})

	it('slices and splices clamped half-open ranges', () => {
		expect(sliceRange('hello\nworld', rangeOf(1, 1, 1, 6))).toBe('hello')
		expect(sliceRange('hello\nworld', rangeOf(1, 6, 2, 1))).toBe('\n')
		expect(sliceRange('hi', rangeOf(1, 1, 9, 9))).toBe('hi')
		expect(spliceRange('hello', rangeOf(1, 1, 1, 6), 'bye')).toBe('bye')
		expect(spliceRange('const x = 1', rangeOf(1, 11, 1, 12), '2')).toBe('const x = 2')
		expect(spliceRange('ac', rangeOf(1, 2, 1, 2), 'b')).toBe('abc')
	})

	it('assembles coordinates without validation', () => {
		expect(rangeOf(1, 11, 1, 12)).toEqual({
			start: { line: 1, column: 11 },
			end: { line: 1, column: 12 },
		})
		expect(rangeOf(2, 3, 5, 7)).toEqual({
			start: { line: 2, column: 3 },
			end: { line: 5, column: 7 },
		})
		expect(rangeOf(5, 1, 1, 1)).toEqual({
			start: { line: 5, column: 1 },
			end: { line: 1, column: 1 },
		})
	})
})

describe('escapeRegExp', () => {
	it('escapes every regular-expression metacharacter', () => {
		expect(escapeRegExp('.*+?^${}()|[]\\')).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\')
	})

	it('leaves already-safe strings unchanged', () => {
		expect(escapeRegExp('alpha-123_value')).toBe('alpha-123_value')
	})

	it('round-trips literal text through a new RegExp', () => {
		const literal = 'file[1].ts?'
		const pattern = new RegExp(`^${escapeRegExp(literal)}$`)
		expect(pattern.test(literal)).toBe(true)
		expect(pattern.test('file1.ts')).toBe(false)
	})
})
