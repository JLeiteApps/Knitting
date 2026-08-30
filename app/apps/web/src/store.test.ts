import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { openVault, sealVault } from './vault'
import type { Store, StoredResult } from './store'
import type { BackupFile } from './backup'

const KEY = 'knitting.web.v1'
const pass = 'synthetic-storage-test-pass'
const profile = { id: 'p1', label: 'Synthetic confidential profile', displayUnit: 'in' as const, upperTorsoIn: 38 }
let rendered: ReactTestRenderer | undefined
let current: Store
let cache: Map<string, string>
let mount: () => Promise<void>
let readDb: typeof import('./storage')['loadAll']

async function until(predicate: () => boolean) {
  for (let i = 0; i < 120; i++) {
    if (predicate()) return
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)) })
  }
  expect(predicate()).toBe(true)
}

async function exportNow(): Promise<BackupFile> {
  let backup!: BackupFile
  await act(async () => { backup = await current.actions.createBackup() })
  await until(() => !current.saving)
  return backup
}

beforeEach(async () => {
  vi.resetModules()
  cache = new Map()
  const factory = new IDBFactory()
  Dexie.dependencies.indexedDB = factory
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  vi.stubGlobal('indexedDB', factory)
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => cache.get(key) ?? null,
    setItem: (key: string, value: string) => { cache.set(key, value) },
    removeItem: (key: string) => cache.delete(key),
  })
  const { useStore } = await import('./store')
  readDb = (await import('./storage')).loadAll
  function Probe() { current = useStore(); return null }
  mount = async () => {
    await act(async () => { rendered = create(createElement(Probe)) })
    await until(() => current.ready)
    await until(() => !current.saving)
  }
})

afterEach(async () => {
  if (rendered) await until(() => !current.saving)
  if (rendered) await act(async () => rendered?.unmount())
  rendered = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('real React and IndexedDB profile lifecycle', () => {
  it('updates a saved draft without duplicating it or overwriting a name collision', async () => {
    await mount()
    const original = structuredClone(current.patterns[0]!)
    const draft = { ...original, meta: { ...original.meta, name: 'Synthetic draft', status: 'draft' as const } }
    await act(async () => { expect(current.actions.addPattern(draft)).toBe(true) })
    await act(async () => { expect(current.actions.addPattern(draft)).toBe(false) })
    const corrected = { ...draft, meta: { ...draft.meta, name: 'Corrected draft' } }
    await act(async () => { expect(current.actions.updatePattern(draft.meta.name, corrected)).toBe(true) })
    expect(current.patterns.map((p) => p.meta.name)).toEqual([original.meta.name, 'Corrected draft'])
    await act(async () => { expect(current.actions.updatePattern(corrected.meta.name, original)).toBe(false) })
    await until(() => !current.saving)
    await act(async () => rendered!.unmount())
    await mount()
    expect(current.patterns.find((p) => p.meta.name === 'Corrected draft')?.sections).toEqual(draft.sections)
    expect(current.patterns).toHaveLength(2)
  })

  it('recovers the newer cache after an IndexedDB write fails', async () => {
    await mount()
    const storage = await import('./storage')
    const writes = vi.spyOn(storage, 'saveAll').mockResolvedValue({ ok: false, error: 'Synthetic storage failure' })
    await act(async () => current.actions.saveProfile(profile))
    await until(() => !current.saving)
    expect(current.storageError).toBe('Synthetic storage failure')
    expect((await readDb())!.profiles).toEqual([])
    await act(async () => rendered!.unmount())
    writes.mockRestore()
    await mount()
    expect(current.profiles).toEqual([profile])
    expect((await readDb())!.profiles).toEqual([profile])
  })

  it('does not hide a repeated storage failure after restore clears the warning', async () => {
    await mount()
    const storage = await import('./storage')
    vi.spyOn(storage, 'saveAll').mockResolvedValue({ ok: false, error: 'Synthetic storage failure' })
    await act(async () => current.actions.saveProfile(profile))
    await until(() => !current.saving)
    const { buildBackup } = await import('./backup')
    const backup = buildBackup({ patterns: [], results: [], profiles: [], displayUnit: 'in', patternUnit: 'in', activeProfileId: null })
    await act(async () => { expect(current.actions.restoreBackup(backup)).toBe(true) })
    await until(() => !current.saving)
    expect(current.storageError).toBe('Synthetic storage failure')
  })

  it('preserves default plaintext profiles across reload', async () => {
    await mount()
    await act(async () => current.actions.saveProfile(profile))
    await until(() => JSON.parse(cache.get(KEY) ?? '{}').profiles?.length === 1)
    await act(async () => rendered!.unmount())
    await mount()
    expect(current.profiles).toEqual([profile])
  })

  it('keeps unlocked profiles out of both stores and exports the newest edit', async () => {
    await mount()
    await act(async () => current.actions.saveProfile(profile))
    await act(async () => { expect(await current.actions.lockProfiles(pass)).toBe(true) })
    await until(() => Boolean(JSON.parse(cache.get(KEY) ?? '{}').profileVault))
    await act(async () => { expect(await current.actions.unlockProfiles(pass)).toBe(true) })
    await act(async () => current.actions.saveProfile({ ...profile, upperTorsoIn: 41 }))
    const backup = await exportNow()
    expect(backup.profiles).toEqual([])
    expect(JSON.parse((await openVault(backup.profileVault!, pass))!)[0].upperTorsoIn).toBe(41)
    await until(() => JSON.parse(cache.get(KEY) ?? '{}').profiles?.length === 0)
    // Let the actual async encryption and IndexedDB transaction finish.
    for (let i = 0; i < 5; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
    const persisted = await readDb()
    expect(persisted!.profiles).toEqual([])
    expect(cache.get(KEY)).not.toContain(profile.label)
    expect(JSON.parse((await openVault(persisted!.profileVault!, pass))!)[0].upperTorsoIn).toBe(41)
    await act(async () => rendered!.unmount())
    await mount()
    expect(current.profiles).toEqual([])
    expect(current.profilesUnlocked).toBe(false)
    await act(async () => { expect(await current.actions.unlockProfiles(pass)).toBe(true) })
    expect(current.profiles[0]!.upperTorsoIn).toBe(41)
  })

  it('migrates a legacy cache-only encrypted vault without replacing it with empty IndexedDB', async () => {
    const profileVault = await sealVault(JSON.stringify([profile]), pass)
    cache.set(KEY, JSON.stringify({ patterns: [], profiles: [profile], results: [], profileVault, displayUnit: 'cm' }))
    await mount()
    expect(current.profileVault).toEqual(profileVault)
    expect(current.profiles).toEqual([])
    expect(current.displayUnit).toBe('cm')
    await act(async () => { expect(await current.actions.unlockProfiles(pass)).toBe(true) })
    expect(current.profiles).toEqual([profile])
    await until(() => !cache.get(KEY)?.includes(profile.label))
  })

  it('migrates cache-only plaintext profiles and preferences', async () => {
    cache.set(KEY, JSON.stringify({ patterns: [], profiles: [profile], results: [], displayUnit: 'cm', patternUnit: 'cm', activeProfileId: profile.id }))
    await mount()
    expect(current.profiles).toEqual([profile])
    expect(current.displayUnit).toBe('cm')
    expect(current.patternUnit).toBe('cm')
    expect(current.activeProfileId).toBe(profile.id)
  })

  it('does not replace plaintext profiles while restoring a foreign encrypted vault', async () => {
    await mount()
    await act(async () => current.actions.saveProfile(profile))
    await until(() => !current.saving)
    const profileVault = await sealVault(JSON.stringify([{ ...profile, id: 'foreign' }]), pass)
    const { buildBackup } = await import('./backup')
    const backup = buildBackup({ patterns: [], results: [], profiles: [], profileVault, displayUnit: 'in', patternUnit: 'in', activeProfileId: null })
    await act(async () => { expect(current.actions.restoreBackup(backup)).toBe(false) })
    expect(current.profiles).toEqual([profile])
    expect(current.profileVault).toBeNull()
    expect(current.storageError).toContain('plaintext')
  })

  it('preserves encrypted edits during a patterns-only restore', async () => {
    await mount()
    await act(async () => current.actions.saveProfile(profile))
    await act(async () => { await current.actions.lockProfiles(pass) })
    await act(async () => { await current.actions.unlockProfiles(pass) })
    await act(async () => current.actions.saveProfile({ ...profile, upperTorsoIn: 42 }))
    const { buildBackup } = await import('./backup')
    const backup = buildBackup({ patterns: [], results: [], profiles: [], displayUnit: 'in', patternUnit: 'in', activeProfileId: null })
    await act(async () => { expect(current.actions.restoreBackup(backup)).toBe(true) })
    expect(current.profilesUnlocked).toBe(true)
    expect(current.profiles[0]!.upperTorsoIn).toBe(42)
    const exported = await exportNow()
    expect(JSON.parse((await openVault(exported.profileVault!, pass))!)[0].upperTorsoIn).toBe(42)
  })

  it('retains more than fifty sheets without silent history eviction', async () => {
    await mount()
    await act(async () => {
      for (let i = 0; i < 55; i++) {
        const result: StoredResult = {
          id: `result-${i}`, patternName: 'Synthetic', sizeLabel: 'S', raw: '',
          sheet: { patternId: 'synthetic', intent: 'body_length_change', sizeIndex: 0, steps: [], warnings: [], createdAt: '2026-08-30T00:00:00Z' },
          validation: { status: 'advisory', pass: false, dimensionChecks: [], sumChecks: [], reasons: [] },
        }
        current.actions.addResult(result)
      }
    })
    expect(current.results).toHaveLength(55)
    expect((await exportNow()).results).toHaveLength(55)
  })
})
