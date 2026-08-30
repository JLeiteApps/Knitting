import { afterEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import type { Store } from './store'

let rendered: ReactTestRenderer | undefined
afterEach(async () => {
  if (rendered) await act(async () => rendered!.unmount())
  rendered = undefined
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('purges an unmounted private editor on vault lock and never writes its unsaved values', async () => {
  vi.resetModules()
  const factory = new IDBFactory()
  Dexie.dependencies.indexedDB = factory
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  vi.stubGlobal('indexedDB', factory)
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const cache = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => cache.get(key) ?? null,
    setItem: (key: string, value: string) => { cache.set(key, value) },
    removeItem: (key: string) => { cache.delete(key) },
  })
  const { useStore } = await import('./store')
  const { loadAll } = await import('./storage')
  const drafts = await import('./sessionDrafts')
  drafts.clearSessionDrafts('')
  let current!: Store
  function Probe() { current = useStore(); return null }
  async function settled() {
    for (let i = 0; i < 120 && (!current.ready || current.saving); i++) {
      await act(async () => { await new Promise(r => setTimeout(r, 25)) })
    }
    expect(current.ready && !current.saving).toBe(true)
  }
  await act(async () => { rendered = create(createElement(Probe)) })
  await settled()
  await act(async () => current.actions.saveProfile({ id: 'p', label: 'Synthetic saved profile', displayUnit: 'in', upperTorsoIn: 36 }))
  await settled()
  drafts.writeSessionDraft('profile:editor', { label: 'Synthetic unsaved private value', values: { upperTorsoIn: '41' } })
  let locked = false
  await act(async () => { locked = await current.actions.lockProfiles('synthetic-lock-test-only') })
  expect(locked).toBe(true)
  await settled()
  expect(drafts.readSessionDraft('profile:editor')).toBeNull()
  expect([...cache.values()].join(' ')).not.toContain('Synthetic unsaved private value')
  expect(JSON.stringify(await loadAll())).not.toContain('Synthetic unsaved private value')
  await act(async () => { expect(await current.actions.unlockProfiles('synthetic-lock-test-only')).toBe(true) })
  await settled()
  expect(drafts.readSessionDraft('profile:editor')).toBeNull()
  expect(current.profiles[0]?.upperTorsoIn).toBe(36)
  drafts.clearSessionDrafts('')
})
