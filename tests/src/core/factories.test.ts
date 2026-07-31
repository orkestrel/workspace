import {
	createBinaryContent,
	createFile,
	createTextContent,
	createWorkspace,
	isBinary,
	isText,
} from '@src/core'
import { describe, expect, it } from 'vitest'

describe('createFile', () => {
	it('derives size and lines and defaults the state', () => {
		const file = createFile({
			path: 'src/main.ts',
			content: createTextContent('const x = 1\nconst y = 2', 'typescript'),
		})
		expect(file.path).toBe('src/main.ts')
		expect(file.state).toBe('created')
		expect(file.size).toBe(23)
		expect(file.lines).toBe(2)
	})

	it('honors explicit state and binary derivation', () => {
		const file = createFile({
			path: 'icon.png',
			content: createBinaryContent('AAAA', 'image/png'),
			state: 'loaded',
		})
		expect(file.state).toBe('loaded')
		expect(file.size).toBe(3)
		expect(file.lines).toBe(0)
	})

	it('returns a plain frozen record that structuredClone preserves', () => {
		const file = createFile({ path: 'a.txt', content: createTextContent('a', 'text') })
		expect(Object.getPrototypeOf(file)).toBe(Object.prototype)
		expect('id' in file).toBe(false)
		expect(Object.isFrozen(file)).toBe(true)
		expect(structuredClone(file)).toEqual(file)
	})
})

describe('content factories', () => {
	it('creates the text arm', () => {
		const content = createTextContent('hello', 'markdown')
		expect(content).toEqual({ text: 'hello', language: 'markdown' })
		expect(isText(content)).toBe(true)
		expect(isBinary(content)).toBe(false)
	})

	it('creates the binary arm', () => {
		const content = createBinaryContent('<base64>', 'image/jpeg')
		expect(content).toEqual({ data: '<base64>', mime: 'image/jpeg' })
		expect(isBinary(content)).toBe(true)
		expect(isText(content)).toBe(false)
	})
})

describe('createWorkspace', () => {
	it('creates an editable observable workspace', () => {
		const written: string[] = []
		const workspace = createWorkspace({ on: { write: (file) => written.push(file.path) } })
		workspace.write('a.ts', 'const x = 1')
		expect(workspace.read('a.ts')).toBe('const x = 1')
		expect(workspace.count).toBe(1)
		expect(workspace.emitter.destroyed).toBe(false)
		expect(written).toEqual(['a.ts'])
	})
})
