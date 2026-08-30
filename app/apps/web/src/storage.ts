/**
 * Durable storage (M5): IndexedDB via Dexie, behind the store.ts seam.
 * localStorage stays as the synchronous bootstrap cache so the app renders
 * instantly; Dexie is the source of truth once hydrated (first mount) and
 * receives every state write.
 */
import Dexie from 'dexie'
import type { Pattern } from '@knitting/schema'
import type { FitProfile, ModificationSheet, ValidationReport } from '@knitting/shared'
import type { DisplayUnit } from './units'
import type { VaultEnvelope } from './vault'

export interface StoredResult {
  id: string
  patternName: string
  sizeLabel: string
  raw: string
  sheet: ModificationSheet
  validation: ValidationReport
}

export interface AppSettings {
  key: 'settings'
  displayUnit: DisplayUnit
  patternUnit: DisplayUnit
  activeProfileId: string | null
  profileVault: VaultEnvelope | null
  revision?: number
}

export interface PersistedState {
  patterns: Pattern[]
  profiles: FitProfile[]
  results: StoredResult[]
  settings: Pick<AppSettings, 'displayUnit' | 'patternUnit' | 'activeProfileId'> & { profileVault?: VaultEnvelope | null }
  profileVault?: VaultEnvelope | null
  settingsPresent?: boolean
  revision?: number
}

class KnitDB extends Dexie {
  patterns!: Dexie.Table<Pattern, string>
  profiles!: Dexie.Table<FitProfile, string>
  results!: Dexie.Table<StoredResult, string>
  settings!: Dexie.Table<AppSettings, string>

  constructor() {
    super('knitting-web')
    this.version(1).stores({
      // record ids = meta.name for patterns, id for the rest
      patterns: 'meta.name'
      , profiles: 'id',
      results: 'id, createdAt',
      settings: 'key',
    })
    this.version(2).stores({
      patterns: 'meta.name', profiles: 'id', results: 'id, createdAt', settings: 'key',
    }).upgrade(async (tx) => {
      // The vault envelope lives in settings from v2 onward. Plaintext rows
      // remain in the default mode; vault-mode writes clear them atomically.
      await tx.table('settings').toCollection().modify((s: AppSettings) => { s.profileVault = s.profileVault ?? null })
    })
  }
}

let db: KnitDB | null = null
function getDb(): KnitDB {
  if (!db) db = new KnitDB()
  return db
}

/** Hydrate once at startup; empty arrays when the DB has never been written. */
export async function loadAll(): Promise<PersistedState | null> {
  try {
    const d = getDb()
    const [patterns, profiles, results, settings] = await Promise.all([
      d.patterns.toArray(),
      d.profiles.toArray(),
      d.results.orderBy('id').reverse().toArray(),
      d.settings.get('settings'),
    ])
    return {
      patterns,
      profiles,
      results: results.sort((a, b) => String(b.sheet?.createdAt ?? '').localeCompare(String(a.sheet?.createdAt ?? ''))),
      settings: settings ?? { displayUnit: 'in', patternUnit: 'in', activeProfileId: null, profileVault: null },
      profileVault: settings?.profileVault ?? null,
      settingsPresent: settings !== undefined,
      revision: settings?.revision ?? 0,
    }
  } catch {
    return null // private mode / blocked → localStorage-only fallback
  }
}

/** Persist a full state snapshot (small data volumes; simple + idempotent). */
export interface StorageResult { ok: boolean; error?: string }

export async function saveAll(state: PersistedState): Promise<StorageResult> {
  try {
    const d = getDb()
    await d.transaction('rw', d.patterns, d.profiles, d.results, d.settings, async () => {
      await d.patterns.clear()
      await d.patterns.bulkPut(state.patterns)
      await d.profiles.clear()
      // Opt-in vault mode persists ciphertext only. The default mode keeps
      // the existing local-first plaintext profile behavior.
      if (!state.profileVault) await d.profiles.bulkPut(state.profiles)
      await d.results.clear()
      await d.results.bulkPut(state.results)
      await d.settings.put({ key: 'settings', ...state.settings, profileVault: state.profileVault ?? null, revision: state.revision ?? 0 })
    })
    return { ok: true }
  } catch {
    return { ok: false, error: 'Device storage is unavailable. Download a backup before closing; the browser cache may be the only saved copy.' }
  }
}
