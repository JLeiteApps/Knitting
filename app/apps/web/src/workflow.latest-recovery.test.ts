import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import AddPattern from './screens/AddPattern'
import { clearSessionDrafts } from './sessionDrafts'
import type { Store } from './store'

vi.mock('./pdf', () => ({ pdfToText: vi.fn() }))
vi.mock('./api', () => ({
  getLlmKey: () => 'synthetic-key', setLlmKey: vi.fn(), callExtractViaApi: vi.fn(),
}))
import { callExtractViaApi } from './api'

let view: ReactTestRenderer | undefined
const text = (node: ReactTestInstance | string): string => typeof node === 'string' ? node : node.children.map(text).join('')
const button = (name: string) => view!.root.findAllByType('button').find(node => text(node) === name)!
const control = (name: string) => view!.root.findAllByType('label').find(node => text(node).includes(name))!
  .find(node => node.type === 'input' || node.type === 'select')
const store = () => ({
  patterns: [], displayUnit: 'in', patternUnit: 'in',
  actions: { addPattern: vi.fn(), updatePattern: vi.fn(), setPatternUnit: vi.fn() },
} as unknown as Store)

async function mount(activeStore = store()) {
  await act(async () => { view = create(createElement(AddPattern, { store: activeStore, go: vi.fn() })) })
}
async function parse(source: string) {
  await act(async () => view!.root.findByType('textarea').props.onChange({ target: { value: source } }))
  await act(async () => button('Parse pasted text').props.onClick())
}

beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); clearSessionDrafts('') })
afterEach(async () => {
  if (view) await act(async () => view!.unmount())
  view = undefined
  clearSessionDrafts('')
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('latest import recovery boundaries', () => {
  it('preserves manual physical dimensions through Source unit change and same-source reparse', async () => {
    await mount()
    await parse('Synthetic source with no parsed sizing table.')
    await act(async () => control('Finished bust/chest values').props.onChange({ target: { value: ' 34, 36 ' } }))
    await act(async () => control('Stitches over span').props.onChange({ target: { value: '20' } }))
    await act(async () => control('Declared span').props.onChange({ target: { value: '4' } }))
    await act(async () => button('← Source').props.onClick())
    await act(async () => control('Pattern units').props.onChange({ target: { value: 'cm' } }))
    await act(async () => button('Parse pasted text').props.onClick())
    expect(control('Finished bust/chest values (cm').props.value).toBe('86.36, 91.44')
    expect(control('Declared span (cm)').props.value).toBe('10.16')
  })

  it('invalidates a deferred extraction when a manual correction takes priority', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof callExtractViaApi>>) => void
    vi.mocked(callExtractViaApi).mockReturnValue(new Promise(done => { resolve = done }))
    await mount()
    await parse('Gauge: 20 sts and 28 rows over 4 inches.\n\nSizes: 34, 36, 38.')
    await act(async () => button('Ask the LLM to help extract these fields').props.onClick())
    expect(text(view!.root)).toContain('extracting…')
    await act(async () => control('Stitches over span').props.onChange({ target: { value: '22' } }))
    expect(text(view!.root)).not.toContain('extracting…')
    await act(async () => resolve({ ok: true, kept: [], dropped: [] }))
    expect(control('Stitches over span').props.value).toBe('22')
  })
})
