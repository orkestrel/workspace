import {
	clampPosition,
	clampRange,
	computeSize,
	countLines,
	createBinaryContent,
	createTextContent,
	decodedSize,
	escapeRegExp,
	inferLanguage,
	isBinary,
	isImage,
	isText,
	isValidRange,
	offsetAt,
	rangeOf,
	sliceRange,
	spliceRange,
} from '@src/core'
import { describe, expect, it } from 'vitest'

describe('inferLanguage', () => {
	it('maps known extensions case-insensitively after the last dot', () => {
		expect(inferLanguage('src/main.ts')).toBe('typescript')
		expect(inferLanguage('component.vue')).toBe('vue')
		expect(inferLanguage('archive.part.JSON')).toBe('json')
		expect(inferLanguage('README.md')).toBe('markdown')
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
		expect(isImage(text)).toBe(false)
		expect(isText(image)).toBe(false)
		expect(isBinary(image)).toBe(true)
		expect(isImage(image)).toBe(true)
	})
})

describe('content derivation', () => {
	it('computes UTF-8 and decoded binary byte sizes', () => {
		expect(computeSize({ text: '', language: 'text' })).toBe(0)
		expect(computeSize({ text: 'café', language: 'text' })).toBe(5)
		expect(computeSize({ text: '😀', language: 'text' })).toBe(4)
		expect(computeSize({ data: 'AAAA', mime: 'image/png' })).toBe(3)
	})

	it('counts text lines and no binary lines', () => {
		expect(countLines({ text: '', language: 'text' })).toBe(0)
		expect(countLines({ text: 'a', language: 'text' })).toBe(1)
		expect(countLines({ text: 'a\nb\n', language: 'text' })).toBe(3)
		expect(countLines({ data: 'AAAA', mime: 'image/png' })).toBe(0)
	})

	it('handles all base64 padding cases and runtime-encoded values', () => {
		expect(decodedSize('')).toBe(0)
		expect(decodedSize('AAAA')).toBe(3)
		expect(decodedSize('AAA=')).toBe(2)
		expect(decodedSize('AA==')).toBe(1)
		for (const payload of ['', 'a', 'ab', 'abc', 'abcd']) {
			expect(decodedSize(btoa(payload))).toBe(payload.length)
		}
	})
})

describe('range helpers', () => {
	it('validates positive ordered ranges', () => {
		expect(isValidRange(rangeOf(1, 1, 2, 1))).toBe(true)
		expect(isValidRange(rangeOf(1, 1, 1, 1))).toBe(true)
		expect(isValidRange(rangeOf(2, 1, 1, 1))).toBe(false)
		expect(isValidRange(rangeOf(1, 0, 1, 1))).toBe(false)
	})

	it('clamps positions and ranges to their addressed lines', () => {
		expect(clampPosition('ab\ncd', { line: 9, column: 9 })).toEqual({ line: 2, column: 3 })
		expect(clampPosition('ab\ncdef', { line: 1, column: 99 })).toEqual({ line: 1, column: 3 })
		expect(clampRange('ab\ncd', rangeOf(1, 1, 9, 9))).toEqual(rangeOf(1, 1, 2, 3))
	})

	it('converts positions to offsets', () => {
		expect(offsetAt('ab\ncd', { line: 1, column: 1 })).toBe(0)
		expect(offsetAt('ab\ncd', { line: 2, column: 1 })).toBe(3)
		expect(offsetAt('ab\ncd', { line: 9, column: 9 })).toBe(5)
	})

	it('slices and splices clamped half-open ranges', () => {
		expect(sliceRange('hello\nworld', rangeOf(1, 1, 1, 6))).toBe('hello')
		expect(sliceRange('hello\nworld', rangeOf(1, 6, 2, 1))).toBe('\n')
		expect(spliceRange('const x = 1', rangeOf(1, 11, 1, 12), '2')).toBe('const x = 2')
		expect(spliceRange('ac', rangeOf(1, 2, 1, 2), 'b')).toBe('abc')
	})

	it('assembles coordinates without validation', () => {
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
