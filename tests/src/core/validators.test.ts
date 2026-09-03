import type { BinaryMIME, FileState } from '@src/core'
import {
	createBinaryContent,
	createFile,
	createTextContent,
	isFile,
	isWorkspaceSnapshot,
} from '@src/core'
import { createHostileValues } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'

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
				content: { base64: 'AA==', mime },
				state: 'created',
				size: 1,
				lines: 0,
			}
			expect(isFile(file)).toBe(false)
			expect(isWorkspaceSnapshot({ id: mime, files: [file] })).toBe(false)
		}
	})

	it('keeps file and snapshot guards total across every hostile value the package ships', () => {
		// `createHostileValues` owns the hostile population and may grow it in a release, so the
		// whole returned set runs in one loop and each failure names the index it came from.
		for (const [index, value] of createHostileValues().entries()) {
			expect(() => isFile(value), `hostile value ${index}`).not.toThrow()
			expect(isFile(value), `hostile value ${index}`).toBe(false)
			expect(() => isWorkspaceSnapshot(value), `hostile value ${index}`).not.toThrow()
			expect(isWorkspaceSnapshot(value), `hostile value ${index}`).toBe(false)
		}
	})
})
