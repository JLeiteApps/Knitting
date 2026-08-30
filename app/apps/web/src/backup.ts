import type { Pattern } from '@knitting/schema'
import type { FitProfile } from '@knitting/shared'
import type { StoredResult } from './store'
import type { DisplayUnit } from './units'

/**
 * Local-first data backup (app plan §2: no accounts in MVP — this file IS the
 * device-migration path). Pure helpers only: no I/O in the parse/merge logic,
 * so backup semantics are unit-testable. The one DOM function (downloadJson)
 * sits at the bottom, separate from the tested surface.
 */

export interface BackupSettings {
  displayUnit: DisplayUnit
  patternUnit: DisplayUnit
  activeProfileId: string | null
}

export interface BackupFile {
  app: 'knit-adapt'
  version: 1
  exportedAt: string
  patterns: Pattern[]
  profiles: FitProfile[]
  results: StoredResult[]
  settings: BackupSettings
}

export interface BackupSource {
  patterns: Pattern[]
  profiles: FitProfile[]
  results: StoredResult[]
  displayUnit: DisplayUnit
  patternUnit: DisplayUnit
  activeProfileId: string | null
}

export function buildBackup(src: BackupSource): BackupFile {
  return {
    app: 'knit-adapt',
    version: 1,
    exportedAt: new Date().toISOString(),
    patterns: src.patterns,
    profiles: src.profiles,
    results: src.results,
    settings: {
      displayUnit: src.displayUnit,
      patternUnit: src.patternUnit,
      activeProfileId: src.activeProfileId,
    },
  }
}

export function backupFilename(): string {
  return `knit-adapt-backup-${new Date().toISOString().slice(0, 10)}.json`
}

/** Strict parse: anything that is not a well-formed v1 backup → null. */
export function parseBackup(json: string): BackupFile | null {
  try {
    const v = JSON.parse(json) as Partial<BackupFile> & { settings?: Partial<BackupSettings> }
    if (v.app !== 'knit-adapt' || v.version !== 1) return null
    if (!Array.isArray(v.patterns) || !Array.isArray(v.profiles) || !Array.isArray(v.results)) {
      return null
    }
    return {
      app: 'knit-adapt',
      version: 1,
      exportedAt: typeof v.exportedAt === 'string' ? v.exportedAt : new Date().toISOString(),
      patterns: v.patterns,
      profiles: v.profiles,
      results: v.results,
      settings: {
        displayUnit: v.settings?.displayUnit === 'cm' ? 'cm' : 'in',
        patternUnit: v.settings?.patternUnit === 'cm' ? 'cm' : 'in',
        activeProfileId:
          typeof v.settings?.activeProfileId === 'string' ? v.settings.activeProfileId : null,
      },
    }
  } catch {
    return null
  }
}

export interface BackupMerge {
  next: BackupSource
  added: { patterns: number; profiles: number; results: number }
}

/**
 * Merge a backup into current state: existing items win (patterns keyed by
 * meta.name, profiles/results by id), the backup's settings come along —
 * restoring on a fresh device reproduces the saved preferences too.
 */
export function mergeBackup(current: BackupSource, b: BackupFile): BackupMerge {
  const patterns = [...current.patterns]
  const profiles = [...current.profiles]
  const results = [...current.results]
  let addedPatterns = 0
  let addedProfiles = 0
  let addedResults = 0
  for (const p of b.patterns) {
    if (!patterns.some((x) => x.meta.name === p.meta.name)) {
      patterns.push(p)
      addedPatterns++
    }
  }
  for (const f of b.profiles) {
    if (!profiles.some((x) => x.id === f.id)) {
      profiles.push(f)
      addedProfiles++
    }
  }
  for (const r of b.results) {
    if (!results.some((x) => x.id === r.id)) {
      results.push(r)
      addedResults++
    }
  }
  return {
    next: {
      patterns,
      profiles,
      results,
      displayUnit: b.settings.displayUnit,
      patternUnit: b.settings.patternUnit,
      activeProfileId: b.settings.activeProfileId,
    },
    added: { patterns: addedPatterns, profiles: addedProfiles, results: addedResults },
  }
}

/** Browser-only download of a pretty-printed JSON file. */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
