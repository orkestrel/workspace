import { roundTripJSON } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import {
	buildWorkspaceSnapshot,
	createRecordedStore,
	createSecretWorkspace,
	seen,
	WORKSPACE_STORE_CASES,
} from './setup.js'

describe('buildWorkspaceSnapshot', () => {
	it('defaults its id to scratch and carries a supplied id through', () => {
		expect(buildWorkspaceSnapshot().id).toBe('scratch')
		expect(buildWorkspaceSnapshot('alpha').id).toBe('alpha')
	})

	it('carries the text file then the binary file, in the order the store cases assert', () => {
		const snapshot = buildWorkspaceSnapshot()
		const [text, binary] = snapshot.files

		expect(snapshot.files.map((file) => file.path)).toEqual(['src/main.ts', 'icon.png'])
		expect(text?.content).toHaveProperty('text', 'const x = 1')
		expect(binary?.content).toEqual({ base64: 'AAAA', mime: 'image/png' })
	})

	it('is pure JSON, which is what the driver-swap parity proofs rest on', () => {
		const snapshot = buildWorkspaceSnapshot('work')

		expect(roundTripJSON(snapshot)).toEqual(snapshot)
	})

	it('returns an independent value on each call, so no case can leak state into another', () => {
		const first = buildWorkspaceSnapshot('shared')
		const second = buildWorkspaceSnapshot('shared')

		expect(second).toEqual(first)
		expect(second).not.toBe(first)
		expect(second.files).not.toBe(first.files)
	})
})

describe('createSecretWorkspace', () => {
	it('puts secret.md first in insertion order, each file holding the query on both lines', () => {
		const workspace = createSecretWorkspace()

		expect(workspace.files().map((file) => file.path)).toEqual(['secret.md', 'notes.md'])
		expect(workspace.search('vault').map((match) => [match.path, match.line])).toEqual([
			['secret.md', 1],
			['secret.md', 2],
			['notes.md', 1],
			['notes.md', 2],
		])
	})
})

// The table is its own proof: every case it carries runs here against a conforming store and the
// real snapshot builder, so a case that stopped observing reddens this file. The membership
// assertion comes first, so an emptied table reddens instead of running nothing.
describe('WORKSPACE_STORE_CASES', () => {
	it('carries the scenarios the store suites run, by name', () => {
		expect(WORKSPACE_STORE_CASES.map((scenario) => scenario.name)).toEqual([
			'round-trips text and binary files',
			'replaces a snapshot under the same id',
			'deletes present values and ignores absent ids',
			'keeps distinct ids independent',
		])
	})

	for (const scenario of WORKSPACE_STORE_CASES) {
		it(`${scenario.name}`, async () => {
			const { actual, expected } = await scenario.probe(
				createRecordedStore(),
				buildWorkspaceSnapshot,
			)

			expect(actual).toEqual(expected)
		})
	}

	it('took a fresh store for every case it carries', () => {
		// Registration order puts this case after the loop, so `seen` holds one entry per case the
		// table carries. No entry repeats, so no case inherited another case's state.
		expect(seen.count).toBe(WORKSPACE_STORE_CASES.length)
		expect(new Set(seen.calls.map(([store]) => store)).size).toBe(seen.count)
	})
})
