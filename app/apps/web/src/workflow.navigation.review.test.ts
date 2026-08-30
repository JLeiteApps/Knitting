import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { flaxLike } from '@knitting/engine'
import App from './App'
import AddPattern from './screens/AddPattern'
import Library from './screens/Library'
import { useStore, type Store } from './store'
import { clearSessionDrafts, readSessionDraft } from './sessionDrafts'

vi.mock('./store', () => ({ useStore: vi.fn(), newId: () => 'synthetic-id' }))
vi.mock('./pdf', () => ({ pdfToText: vi.fn() }))
vi.mock('./api', () => ({ getLlmKey: () => '', setLlmKey: vi.fn(), callExtractViaApi: vi.fn() }))
let view: ReactTestRenderer | undefined
let events: EventTarget
const text = (node: ReactTestInstance | string): string => typeof node === 'string' ? node : node.children.map(text).join('')
const button = (name: string) => view!.root.findAllByType('button').find(n => text(n) === name)!
beforeEach(() => {
  clearSessionDrafts('')
  events = new EventTarget()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('window', {
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events), scrollTo: vi.fn(),
  })
  vi.stubGlobal('history', { replaceState: vi.fn(), pushState: vi.fn() })
  vi.stubGlobal('document', { title: '' })
  const saved = flaxLike()
  saved.meta = { ...saved.meta, name: 'new', status: 'draft' }
  vi.mocked(useStore).mockReturnValue({
    patterns: [saved], profiles: [], results: [], ready: true, displayUnit: 'in', patternUnit: 'in',
    activeProfileId: null, profileVault: null, profilesUnlocked: true, saving: false,
    actions: { setPatternUnit: vi.fn() },
  } as unknown as Store)
})
afterEach(async () => {
  if (view) await act(async () => view!.unmount())
  view = undefined
  clearSessionDrafts('')
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

it('keeps a saved pattern named new separate from a fresh import during direct navigation', async () => {
  await act(async () => { view = create(createElement(App)) })
  await act(async () => view!.root.findByType(Library).props.go({ name: 'add', patternName: 'new' }))
  const nameInput = () => view!.root.findAllByType('label').find(n => text(n) === 'Pattern name')!.findByType('input')
  await act(async () => nameInput().props.onChange({ target: { value: 'Saved draft correction' } }))
  await act(async () => button('Add pattern').props.onClick())
  expect(text(view!.root)).toContain('Add a pattern')
  expect(view!.root.findByType('textarea').props.value).toBe('')
  await act(async () => view!.root.findByType('textarea').props.onChange({ target: { value: 'Separate fresh source text' } }))
  await act(async () => view!.root.findByType(AddPattern).props.go({ name: 'add', patternName: 'new' }))
  expect(nameInput().props.value).toBe('Saved draft correction')
  await act(async () => button('Add pattern').props.onClick())
  expect(view!.root.findByType('textarea').props.value).toBe('Separate fresh source text')
})

it('warns before leaving with an unparsed import and stops warning after source-stage discard', async () => {
  await act(async () => { view = create(createElement(App)) })
  const unload = () => { const event = new Event('beforeunload', { cancelable: true }); events.dispatchEvent(event); return event.defaultPrevented }
  expect(unload()).toBe(false)
  await act(async () => button('Add pattern').props.onClick())
  await act(async () => view!.root.findByType('textarea').props.onChange({ target: { value: 'Unparsed private source text' } }))
  expect(unload()).toBe(true)
  await act(async () => button('Library').props.onClick())
  expect(unload()).toBe(true)
  expect(JSON.stringify(vi.mocked(history.pushState).mock.calls)).not.toContain('Unparsed private source text')
  await act(async () => button('Add pattern').props.onClick())
  expect(view!.root.findByType('textarea').props.value).toBe('Unparsed private source text')
  await act(async () => button('Discard unsaved changes').props.onClick())
  expect(view!.root.findByType('textarea').props.value).toBe('')
  expect(readSessionDraft('add:new')).toBeNull()
  expect(unload()).toBe(false)
})
