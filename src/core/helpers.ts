import type { BinaryMIME, FileContent, Position, Range } from './types.js'
import { EXTENSION_LANGUAGES } from './constants.js'

/**
 * Infer a language tag from the final file extension.
 *
 * @param path - The file path
 * @returns The mapped language, or `text` when the extension is absent or unknown
 *
 * @example
 * ```ts
 * inferLanguage('src/main.ts') // 'typescript'
 * ```
 */
export function inferLanguage(path: string): string {
	const dot = path.lastIndexOf('.')
	if (dot === -1) return 'text'
	const extension = path.slice(dot + 1).toLowerCase()
	return EXTENSION_LANGUAGES[extension] ?? 'text'
}

/**
 * Determine whether content is the text arm.
 *
 * @param content - The file content
 * @returns Whether the content carries text and a language
 *
 * @example
 * ```ts
 * isText({ text: 'hello', language: 'text' }) // true
 * ```
 */
export function isText(
	content: FileContent,
): content is { readonly text: string; readonly language: string } {
	return 'text' in content
}

/**
 * Determine whether content is the binary arm.
 *
 * @param content - The file content
 * @returns Whether the content carries base64 data and a MIME
 *
 * @example
 * ```ts
 * isBinary({ data: 'AAAA', mime: 'image/png' }) // true
 * ```
 */
export function isBinary(
	content: FileContent,
): content is { readonly data: string; readonly mime: BinaryMIME } {
	return 'data' in content
}

/**
 * Compute the byte size of file content.
 *
 * @param content - The content to measure
 * @returns UTF-8 bytes for text or decoded bytes for binary content
 *
 * @example
 * ```ts
 * computeSize({ text: 'café', language: 'text' }) // 5
 * ```
 */
export function computeSize(content: FileContent): number {
	if (isText(content)) return new TextEncoder().encode(content.text).length
	return decodedSize(content.data)
}

/**
 * Count the lines in file content.
 *
 * @param content - The content to inspect
 * @returns The text line count, or zero for empty text and binary content
 *
 * @example
 * ```ts
 * countLines({ text: 'a\nb', language: 'text' }) // 2
 * ```
 */
export function countLines(content: FileContent): number {
	if (!isText(content)) return 0
	if (content.text.length === 0) return 0
	let count = 1
	for (const character of content.text) if (character === '\n') count += 1
	return count
}

/**
 * Compute the decoded byte length of a base64 string.
 *
 * @param base64 - The base64 data
 * @returns The decoded byte count
 *
 * @example
 * ```ts
 * decodedSize('AAAA') // 3
 * ```
 */
export function decodedSize(base64: string): number {
	let padding = 0
	if (base64.endsWith('==')) padding = 2
	else if (base64.endsWith('=')) padding = 1
	return Math.floor((base64.length * 3) / 4) - padding
}

/**
 * Determine whether a 1-based range is structurally valid.
 *
 * @param range - The range to inspect
 * @returns Whether both positions are positive and ordered
 *
 * @example
 * ```ts
 * isValidRange({ start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }) // true
 * ```
 */
export function isValidRange(range: Range): boolean {
	if (range.start.line < 1 || range.start.column < 1) return false
	if (range.end.line < 1 || range.end.column < 1) return false
	if (range.start.line > range.end.line) return false
	return !(range.start.line === range.end.line && range.start.column > range.end.column)
}

/**
 * Clamp a position to text bounds.
 *
 * @param text - The addressed text
 * @param position - The requested position
 * @returns The clamped position
 *
 * @example
 * ```ts
 * clampPosition('ab', { line: 9, column: 9 }) // { line: 1, column: 3 }
 * ```
 */
export function clampPosition(text: string, position: Position): Position {
	const lines = text.split('\n')
	const line = Math.max(1, Math.min(position.line, lines.length))
	const lineText = lines[line - 1] ?? ''
	const column = Math.max(1, Math.min(position.column, lineText.length + 1))
	return { line, column }
}

/**
 * Clamp both positions in a range to text bounds.
 *
 * @param text - The addressed text
 * @param range - The requested range
 * @returns The clamped range
 *
 * @example
 * ```ts
 * clampRange('ab', { start: { line: 1, column: 1 }, end: { line: 9, column: 9 } })
 * ```
 */
export function clampRange(text: string, range: Range): Range {
	return { start: clampPosition(text, range.start), end: clampPosition(text, range.end) }
}

/**
 * Convert a 1-based position to a zero-based string offset.
 *
 * @param text - The addressed text
 * @param position - The requested position
 * @returns The bounded string offset
 *
 * @example
 * ```ts
 * offsetAt('ab\ncd', { line: 2, column: 1 }) // 3
 * ```
 */
export function offsetAt(text: string, position: Position): number {
	const lines = text.split('\n')
	let offset = 0
	for (let index = 0; index < position.line - 1 && index < lines.length; index += 1) {
		offset += (lines[index]?.length ?? 0) + 1
	}
	offset += position.column - 1
	return Math.min(offset, text.length)
}

/**
 * Slice a clamped half-open text range.
 *
 * @param text - The source text
 * @param range - The requested range
 * @returns The ranged substring
 *
 * @example
 * ```ts
 * sliceRange('hello', { start: { line: 1, column: 1 }, end: { line: 1, column: 6 } }) // 'hello'
 * ```
 */
export function sliceRange(text: string, range: Range): string {
	const clamped = clampRange(text, range)
	return text.slice(offsetAt(text, clamped.start), offsetAt(text, clamped.end))
}

/**
 * Replace a clamped half-open text range.
 *
 * @param text - The source text
 * @param range - The requested range
 * @param replacement - The replacement text
 * @returns The spliced text
 *
 * @example
 * ```ts
 * spliceRange('hello', { start: { line: 1, column: 1 }, end: { line: 1, column: 6 } }, 'bye')
 * ```
 */
export function spliceRange(text: string, range: Range, replacement: string): string {
	const clamped = clampRange(text, range)
	const start = offsetAt(text, clamped.start)
	const end = offsetAt(text, clamped.end)
	return text.slice(0, start) + replacement + text.slice(end)
}

/**
 * Assemble a nested range from four 1-based coordinates.
 *
 * @param fromLine - The start line
 * @param fromColumn - The start column
 * @param toLine - The end line
 * @param toColumn - The end column
 * @returns The assembled range without validation
 *
 * @example
 * ```ts
 * rangeOf(1, 1, 1, 2)
 * ```
 */
export function rangeOf(
	fromLine: number,
	fromColumn: number,
	toLine: number,
	toColumn: number,
): Range {
	return { start: { line: fromLine, column: fromColumn }, end: { line: toLine, column: toColumn } }
}

/**
 * Escape regular-expression metacharacters for literal matching.
 *
 * @param value - The literal text
 * @returns The escaped regular-expression source
 *
 * @example
 * ```ts
 * escapeRegExp('a.b') // 'a\\.b'
 * ```
 */
export function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
