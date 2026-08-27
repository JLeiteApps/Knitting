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
}

export interface PersistedState {
  patterns: Pattern[]
  profiles: FitProfile[]
  results: StoredResult[]
  settings: Pick<AppSettings, 'displayUnit' | 'patternUnit' | 'activeProfileId'>
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
      results: results.sort((a, b) => (a.sheet.createdAt < b.sheet.createdAt ? 1 : -1)),
      settings: settings ?? { displayUnit: 'in', patternUnit: 'in', activeProfileId: null },
    }
  } catch {
    return null // private mode / blocked → localStorage-only fallback
  }
}

/** Persist a full state snapshot (small data volumes; simple + idempotent). */
export async function saveAll(state: PersistedState): Promise<void> {
  try {
    const d = getDb()
    await d.transaction('rw', d.patterns, d.profiles, d.results, d.settings, async () => {
      await d.patterns.clear()
      await d.patterns.bulkPut(state.patterns)
      await d.profiles.clear()
      await d.profiles.bulkPut(state.profiles)
      await d.results.clear()
      await d.results.bulkPut(state.results)
      await d.settings.put({ key: 'settings', ...state.settings })
    })
  } catch {
    // storage unavailable → localStorage fallback already wrote
  }
}
