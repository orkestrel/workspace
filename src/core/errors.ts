import type { WorkspaceErrorCode } from './types.js'

/** An invalid workspace edit or search operation. */
export class WorkspaceError extends Error {
	readonly code: WorkspaceErrorCode
	readonly context?: Readonly<Record<string, unknown>>

	/**
	 * Create a workspace error.
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
 * Narrow a caught value to a {@link WorkspaceError}.
 *
 * @param value - The caught value
 * @returns Whether the value is a workspace error
 *
 * @example
 * ```ts
 * if (isWorkspaceError(error)) error.code
 * ```
 */
export function isWorkspaceError(value: unknown): value is WorkspaceError {
	return value instanceof WorkspaceError
}
