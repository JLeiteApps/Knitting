import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import AddPattern from './screens/AddPattern'
import { pdfToText } from './pdf'
import { clearSessionDrafts, readSessionDraft } from './sessionDrafts'
import type { Store } from './store'

vi.mock('./pdf', () => ({ pdfToText: vi.fn() }))
vi.mock('./api', () => ({
  getLlmKey: () => 'synthetic-key-not-in-drafts', setLlmKey: vi.fn(), callExtractViaApi: vi.fn(),
}))
let view: ReactTestRenderer | undefined
const text = (n: ReactTestInstance | string): string => typeof n === 'string' ? n : n.children.map(text).join('')
const button = (name: string) => view!.root.findAllByType('button').find(b => text(b) === name)!
const control = (name: string) => view!.root.findAllByType('label').find(l => text(l).includes(name))!
  .find(n => n.type === 'input' || n.type === 'select')
const baseStore = () => ({
  patterns: [], displayUnit: 'in', patternUnit: 'in',
  actions: { addPattern: vi.fn().mockReturnValue(true), updatePattern: vi.fn().mockReturnValue(true), setPatternUnit: vi.fn() },
} as unknown as Store)
async function mount(store: Store) {
  await act(async () => { view = create(createElement(AddPattern, { store, go: vi.fn() })) })
}
async function pasteSource(value: string) {
  await act(async () => control('Garment').props.onChange({ target: { value: 'sweater' } }))
  await act(async () => view!.root.findByType('textarea').props.onChange({ target: { value } }))
  await act(async () => button('Parse pasted text').props.onClick())
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  clearSessionDrafts('')
})
afterEach(async () => {
  if (view) await act(async () => view!.unmount())
  view = undefined
  clearSessionDrafts('')
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('independent import draft recovery review', () => {
  it('requires the enabled Sweater selection and retains it across source-stage recovery', async () => {
    await mount(baseStore())
    expect(control('Garment').props.value).toBe('')
    expect(button('Parse pasted text').props.disabled).toBe(true)
    const options = control('Garment').findAllByType('option')
    expect(options.find((option) => option.props.value === 'sock')?.props.disabled).toBe(true)

    await act(async () => control('Garment').props.onChange({ target: { value: 'sweater' } }))
    expect(button('Parse pasted text').props.disabled).toBe(true)
    await act(async () => view!.root.findByType('textarea').props.onChange({ target: { value: 'Synthetic sweater source text.' } }))
    expect(button('Parse pasted text').props.disabled).toBe(false)
    await act(async () => view!.unmount())
    await mount(baseStore())
    expect(control('Garment').props.value).toBe('sweater')
  })

  it('restores correction values with their original declared unit and without API keys', async () => {
    const store = baseStore()
    await mount(store)
    await pasteSource('Synthetic source without automatic size extraction.')
    await act(async () => control('Pattern name').props.onChange({ target: { value: 'Synthetic restored import' } }))
    await act(async () => control('Finished bust/chest values').props.onChange({ target: { value: '34, 36, 38' } }))
    await act(async () => control('Size labels').props.onChange({ target: { value: 'S, M, L' } }))
    await act(async () => control('Stitches over span').props.onChange({ target: { value: '20' } }))
    await act(async () => control('Declared span').props.onChange({ target: { value: '4' } }))
    await act(async () => view!.unmount())
    await mount({ ...store, patternUnit: 'cm' })
    expect(control('Pattern name').props.value).toBe('Synthetic restored import')
    expect(control('Size labels').props.value).toBe('S, M, L')
    expect(control('Finished bust/chest values (in').props.value).toBe('34, 36, 38')
    expect(control('Declared span (in)').props.value).toBe('4')
    expect(JSON.stringify(readSessionDraft('add:new'))).not.toContain('synthetic-key-not-in-drafts')
    await act(async () => button('Save as draft').props.onClick())
    expect(store.actions.addPattern).toHaveBeenCalledTimes(1)
    const saved = vi.mocked(store.actions.addPattern).mock.calls[0]![0]
    expect(saved.garmentKind).toBe('sweater')
    expect(saved.sizing.bustOrChestIn).toEqual([34, 36, 38])
    expect(saved.gauge[0]?.stsPerIn).toBe(5)
    expect(readSessionDraft('add:new')).toBeNull()
  })

  it('does not let a pending PDF replace a subsequently parsed paste', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof pdfToText>>) => void
    vi.mocked(pdfToText).mockReturnValue(new Promise(r => { resolve = r }))
    await mount(baseStore())
    await act(async () => view!.root.findAllByType('input').find(n => n.props.type === 'file')!.props.onChange({ target: { files: [{ name: 'Old synthetic.pdf' }] } }))
    await pasteSource('Newer synthetic source entered while the old PDF was processing.')
    expect(control('Pattern name').props.value).toBe('Pasted pattern')
    await act(async () => resolve({ text: 'Old synthetic source completed late.', pages: 1, truncated: false }))
    expect(control('Pattern name').props.value).toBe('Pasted pattern')
  })
})
