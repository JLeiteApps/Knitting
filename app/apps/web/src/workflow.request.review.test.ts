import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer'
import { flaxLike } from '@knitting/engine'
import NewModification from './screens/NewModification'
import { classifyViaApi } from './classify'
import { clearSessionDrafts, readSessionDraft } from './sessionDrafts'
import type { Store } from './store'

vi.mock('./classify', async (original) => ({
  ...await original<typeof import('./classify')>(),
  classifyViaApi: vi.fn(),
}))

let view: ReactTestRenderer | undefined
const nodeText = (node: ReactTestInstance | string): string =>
  typeof node === 'string' ? node : node.children.map(nodeText).join('')
const button = (name: string) => view!.root.findAllByType('button').find(b => nodeText(b) === name)!
const buttonMatching = (text: string) => view!.root.findAllByType('button').find(b => nodeText(b).includes(text))!
const labelControl = (text: string) => {
  const label = view!.root.findAllByType('label').find(l => nodeText(l).includes(text))!
  return label.find(n => n.type === 'select' || n.type === 'input' || n.type === 'textarea')
}

function storeForTest(): Store {
  const first = { id: 'profile-first', label: 'Synthetic first', displayUnit: 'in', upperTorsoIn: 36, fullBustIn: 40 }
  const active = { ...first, id: 'profile-active', label: 'Synthetic active' }
  return {
    patterns: [flaxLike()], profiles: [first, active], results: [], displayUnit: 'in',
    patternUnit: 'in', activeProfileId: active.id, profileVault: null,
    profilesUnlocked: true, storageError: null, revision: 0, ready: true, saving: false,
    actions: { setActiveProfile: vi.fn(), addResult: vi.fn() },
  } as unknown as Store
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('localStorage', { getItem: () => 'synthetic-test-key' })
  clearSessionDrafts('')
})
afterEach(async () => {
  if (view) await act(async () => view!.unmount())
  view = undefined
  clearSessionDrafts('')
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})
async function mount(store: Store, patternId = store.patterns[0]!.meta.name) {
  await act(async () => { view = create(createElement(NewModification, { store, patternId, go: vi.fn() })) })
}

describe('independent request identity and interaction review', () => {
  it('shows unsupported garment records as unavailable and blocks drafting and Run', async () => {
    const store = storeForTest()
    store.patterns[0]!.construction.type = 'accessory_sock'
    await mount(store)
    expect(nodeText(view!.root)).toContain('Modification unavailable')
    expect(button('Draft intent from text').props.disabled).toBe(true)
    expect(button('Run modification').props.disabled).toBe(true)
  })

  it('never substitutes the first library pattern for a deleted route target', async () => {
    const store = storeForTest()
    await mount(store, 'Deleted source pattern')
    expect(nodeText(view!.root)).not.toContain(store.patterns[0]!.meta.name)
    expect(button('Run modification')?.props.disabled ?? true).toBe(true)
    expect(store.actions.addResult).not.toHaveBeenCalled()
  })

  it('initially selects the active profile rather than the first profile', async () => {
    const store = storeForTest()
    await mount(store)
    expect(labelControl('Fit profile').props.value).toBe(store.activeProfileId)
  })

  it('does not invent a default amount and distinguishes clearing from zero', async () => {
    await mount(storeForTest())
    await act(async () => button('Body length').props.onClick())
    expect(button('Run modification').props.disabled).toBe(true)
    const change = () => labelControl('negative shortens')
    await act(async () => change().props.onChange({ target: { value: '0' } }))
    expect(button('Run modification').props.disabled).toBe(false)
    await act(async () => change().props.onChange({ target: { value: '' } }))
    expect(button('Run modification').props.disabled).toBe(true)
  })

  it('ignores a pending classifier after the user changes the request and intent', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof classifyViaApi>>) => void
    vi.mocked(classifyViaApi).mockReturnValue(new Promise(r => { resolve = r }))
    await mount(storeForTest())
    await act(async () => labelControl('What do you want to change?').props.onChange({ target: { value: 'make this bigger' } }))
    await act(async () => button('Draft intent from text').props.onClick())
    await act(async () => { void buttonMatching('Let the LLM try').props.onClick() })
    expect(classifyViaApi).toHaveBeenCalledTimes(1)
    await act(async () => labelControl('What do you want to change?').props.onChange({ target: { value: 'make the body one inch longer' } }))
    await act(async () => button('Body length').props.onClick())
    await act(async () => labelControl('negative shortens').props.onChange({ target: { value: '1' } }))
    await act(async () => resolve({ status: 'ok', intent: 'gauge_conversion', params: { kind: 'gauge', userStsPerIn: 5 }, missingSlots: [], clarifyingQuestion: null }))
    expect(labelControl('negative shortens').props.value).toBe(1)
    expect(button('Body length').props.className).toContain('active')
  })

  it('keeps gauge ratios unchanged through cm/in switches and remount', async () => {
    const store = storeForTest()
    await mount(store)
    await act(async () => button('Gauge conversion').props.onClick())
    await act(async () => labelControl('Span unit').props.onChange({ target: { value: 'cm' } }))
    await act(async () => labelControl('Stitches measured').props.onChange({ target: { value: '20' } }))
    await act(async () => labelControl('Measured span').props.onChange({ target: { value: '10' } }))
    const stored = () => readSessionDraft<{ params: { userStsPerIn: number; userRowsPerIn?: number } }>(`newmod:${store.patterns[0]!.meta.name}`)!
    expect(stored().params.userStsPerIn).toBeCloseTo(5.08, 10)
    expect(stored().params.userRowsPerIn).toBeUndefined()
    await act(async () => labelControl('Span unit').props.onChange({ target: { value: 'in' } }))
    expect(stored().params.userStsPerIn).toBeCloseTo(5.08, 10)
    await act(async () => view!.unmount())
    await mount(store)
    expect(labelControl('Stitches measured').props.value).toBe('20')
    expect(stored().params.userStsPerIn).toBeCloseTo(5.08, 10)
    await act(async () => labelControl('Span unit').props.onChange({ target: { value: 'cm' } }))
    expect(Number(labelControl('Measured span').props.value)).toBeCloseTo(10, 10)
  })

  it('invalidates a valid gauge when an invalid optional row count is entered', async () => {
    await mount(storeForTest())
    await act(async () => button('Gauge conversion').props.onClick())
    await act(async () => labelControl('Stitches measured').props.onChange({ target: { value: '20' } }))
    await act(async () => labelControl('Measured span').props.onChange({ target: { value: '4' } }))
    expect(button('Run modification').props.disabled).toBe(false)
    await act(async () => labelControl('Rows measured').props.onChange({ target: { value: '-1' } }))
    expect(button('Run modification').props.disabled).toBe(true)
  })

  it('blocks a selected profile removed while the request stays mounted', async () => {
    const store = storeForTest()
    await mount(store)
    await act(async () => button('Body length').props.onClick())
    await act(async () => labelControl('negative shortens').props.onChange({ target: { value: '1' } }))
    expect(button('Run modification').props.disabled).toBe(false)
    const changed = { ...store, profiles: store.profiles.filter(p => p.id !== store.activeProfileId) }
    await act(async () => view!.update(createElement(NewModification, { store: changed, patternId: store.patterns[0]!.meta.name, go: vi.fn() })))
    expect(button('Run modification').props.disabled).toBe(true)
    expect(nodeText(view!.root)).toContain('selected fit profile')
  })
})
