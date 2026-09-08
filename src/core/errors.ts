import type { WorkspaceErrorCode } from './types.js'

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
		this.name = 'WorkspaceError'
		this.code = code
		if (context !== undefined) this.context = context
	}
}

/**
 * Narrows a caught value to a {@link WorkspaceError}.
 *
 * @remarks
 * The check is one `instanceof` test, so it stays total: every input answers `true` or `false`
 * and none throws.
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
	return value instanceof WorkspaceError
}
