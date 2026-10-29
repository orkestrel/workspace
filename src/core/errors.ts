import type { WorkspaceErrorCode } from './types.js'
import { holds, INTRINSICS, isFunction, isObject } from '@orkestrel/contract'

/**
 * Reports an invalid workspace edit or search operation, carrying a {@link WorkspaceErrorCode}
 * and, when the operation had one, the context it ran under.
 */
export class WorkspaceError extends Error {
	readonly code: WorkspaceErrorCode
	readonly context?: Readonly<Record<string, unknown>>

	/**
	 * Creates a workspace error.
	 *
	 * @param code - The machine-readable failure code
	 * @param message - The human-readable failure message
	 * @param context - Optional values associated with the failed operation
	 */
	constructor(
		code: WorkspaceErrorCode,
		message: string,
		context?: Readonly<Record<string, unknown>>,
	) {
		super(message)
		INTRINSICS.define(this, Symbol.for('@orkestrel/workspace.WorkspaceError'), { value: this })
		this.name = 'WorkspaceError'
		this.code = code
		if (context !== undefined) this.context = context
	}
}

/**
 * Narrows a caught value to a {@link WorkspaceError}.
 *
 * @remarks
 * Checks the identity brand and declared members across package copies, accepting subclasses
 * and refusing transparent proxies. Inspection failures return false.
 *
 * @param value - The caught value
 * @returns True if the value is a workspace error; false otherwise
 *
 * @example
 * ```ts
 * if (isWorkspaceError(error)) error.code
 * ```
 */
export function isWorkspaceError(value: unknown): value is WorkspaceError {
	return holds(() => {
		if (!(value instanceof Error) || INTRINSICS.prototype(value) === Error.prototype) return false
		const brand = INTRINSICS.describe(value, Symbol.for('@orkestrel/workspace.WorkspaceError'))
		if (brand?.value !== value) return false
		const code: unknown = INTRINSICS.reflect.read(value, 'code')
		if (code !== 'MISSING' && code !== 'MODALITY' && code !== 'PATTERN' && code !== 'RANGE')
			return false
		const context: unknown = INTRINSICS.reflect.read(value, 'context')
		return context === undefined || isObject(context) || isFunction(context)
	})
}
