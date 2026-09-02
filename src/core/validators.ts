import type { FileInterface, WorkspaceSnapshot } from './types.js'
import { arrayOf, holds, isNumber, isRecord, isString, literalOf } from '@orkestrel/contract'

/**
 * Narrow an unknown value to an immutable file record.
 *
 * @param value - The value to inspect
 * @returns Whether the value has the file shape
 *
 * @example
 * ```ts
 * isFile({ path: 'a.txt', content: { text: 'a', language: 'text' }, state: 'created', size: 1, lines: 1 })
 * ```
 */
export function isFile(value: unknown): value is FileInterface {
	return holds(() => {
		if (!isRecord(value)) return false
		if (!isString(value.path) || !literalOf('created', 'modified')(value.state)) return false
		if (!isNumber(value.size) || !isNumber(value.lines)) return false
		if (!isRecord(value.content)) return false
		const text = isString(value.content.text) && isString(value.content.language)
		const binary =
			isString(value.content.base64) &&
			literalOf('image/png', 'image/jpeg', 'image/gif', 'image/webp')(value.content.mime)
		return text || binary
	})
}

/**
 * Narrow an unknown value to a workspace snapshot.
 *
 * @param value - The value read from a persistence boundary
 * @returns Whether the value has the workspace snapshot shape
 *
 * @example
 * ```ts
 * isWorkspaceSnapshot({ id: 'work', files: [] }) // true
 * ```
 */
export function isWorkspaceSnapshot(value: unknown): value is WorkspaceSnapshot {
	return holds(() => isRecord(value) && isString(value.id) && arrayOf(isFile)(value.files))
}
