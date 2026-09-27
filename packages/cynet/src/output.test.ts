import { afterEach, describe, expect, it, vi } from 'vitest'
import { getOutputFormat, output, printEmpty, setOutputFormat } from './output.js'

afterEach(() => {
	setOutputFormat('text')
	vi.restoreAllMocks()
})

function captureLog() {
	return vi.spyOn(console, 'log').mockImplementation(() => {})
}

describe('output format', () => {
	it('starts in text mode', () => {
		expect(getOutputFormat()).toBe('text')
	})

	it('prints the readable rendering in text mode', () => {
		const log = captureLog()
		output({ members: 3 }, () => '3 members')
		expect(log).toHaveBeenCalledWith('3 members')
	})

	it('prints the structured value in json mode', () => {
		const log = captureLog()
		setOutputFormat('json')
		output({ members: 3 }, () => '3 members')
		expect(log).toHaveBeenCalledWith(JSON.stringify({ members: 3 }, null, 2))
	})

	it('does not build the readable rendering in json mode', () => {
		captureLog()
		setOutputFormat('json')
		const readable = vi.fn(() => 'unused')
		output({}, readable)
		expect(readable).not.toHaveBeenCalled()
	})
})

describe(printEmpty.name, () => {
	it('names what was empty rather than printing a blank line', () => {
		const log = captureLog()
		printEmpty('members')
		expect(log).toHaveBeenCalledWith('0 members found')
	})

	it('reports the empty result as structured data in json mode', () => {
		const log = captureLog()
		setOutputFormat('json')
		printEmpty('members')
		expect(log).toHaveBeenCalledWith(JSON.stringify({ count: 0, entity: 'members', items: [] }, null, 2))
	})
})
