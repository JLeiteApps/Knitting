import type { Pattern } from '@knitting/schema'
import { validatePatternUnknown } from '@knitting/schema'
import type { FitProfile } from '@knitting/shared'
import type { StoredResult } from './store'
import type { DisplayUnit } from './units'
import type { VaultEnvelope } from './vault'

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
  /** v1 was plaintext profiles; v2 carries only the encrypted vault. */
  version: 1 | 2
  exportedAt: string
  patterns: Pattern[]
  profiles: FitProfile[]
  results: StoredResult[]
  settings: BackupSettings
  profileVault?: VaultEnvelope | null
}

export interface BackupSource {
  patterns: Pattern[]
  profiles: FitProfile[]
  results: StoredResult[]
  displayUnit: DisplayUnit
  patternUnit: DisplayUnit
  activeProfileId: string | null
  profileVault?: VaultEnvelope | null
}

/** One shared cap for the bytes written to disk and bytes accepted at import. */
export const MAX_BACKUP_BYTES = 12 * 1024 * 1024

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

export function serializeBackup(data: unknown): string {
  const json = JSON.stringify(data, null, 2)
  if (utf8ByteLength(json) > MAX_BACKUP_BYTES) {
    throw new Error('This backup is larger than 12 MiB. Nothing was downloaded and your data was not changed; selective backups are not available yet.')
  }
  return json
}

export function buildBackup(src: BackupSource): BackupFile {
  return {
    app: 'knit-adapt',
    version: src.profileVault ? 2 : 1,
    exportedAt: new Date().toISOString(),
    patterns: src.patterns,
    // An unlocked vault still has ephemeral plaintext in the React state;
    // never serialize it. Fresh restores unlock only after a passphrase.
    profiles: src.profileVault ? [] : src.profiles,
    results: src.results,
    settings: {
      displayUnit: src.displayUnit,
      patternUnit: src.patternUnit,
      activeProfileId: src.activeProfileId,
    },
    ...(src.profileVault ? { profileVault: src.profileVault } : {}),
  }
}

export function backupFilename(): string {
  return `knit-adapt-backup-${new Date().toISOString().slice(0, 10)}.json`
}

/** Strict parse of plaintext v1 and encrypted v2 backups. */
export function parseBackup(json: string): BackupFile | null {
  try {
    if (utf8ByteLength(json) > MAX_BACKUP_BYTES) return null
    const v = JSON.parse(json) as Partial<BackupFile> & { settings?: Partial<BackupSettings> }
    if (v.app !== 'knit-adapt' || (v.version !== 1 && v.version !== 2)) return null
    if (!Array.isArray(v.patterns) || !Array.isArray(v.profiles) || !Array.isArray(v.results)) {
      return null
    }
    const version = v.version
    const profileVault = version === 2 ? parseVault(v.profileVault) : null
    if (version === 2 && !profileVault) return null
    const patterns = v.patterns.filter(isStoredPattern)
    if (patterns.length !== v.patterns.length) return null
    const profiles = v.profiles.filter(isProfile)
    if (profiles.length !== v.profiles.length) return null
    if (version === 2 && profiles.length > 0) return null
    // v1 results from older builds did not retain enough input to recompute a
    // certificate. Preserve them as explicit advisory history entries; never
    // carry their old `validation.pass` as a current verification.
    const results = v.results.map(normalizeLegacyResult)
    if (results.some((r) => r === null)) return null
    return {
      app: 'knit-adapt',
      version,
      exportedAt: typeof v.exportedAt === 'string' ? v.exportedAt : new Date().toISOString(),
      patterns,
      profiles,
      results: results as StoredResult[],
      settings: {
        displayUnit: v.settings?.displayUnit === 'cm' ? 'cm' : 'in',
        patternUnit: v.settings?.patternUnit === 'cm' ? 'cm' : 'in',
        activeProfileId:
          typeof v.settings?.activeProfileId === 'string' ? v.settings.activeProfileId : null,
      },
      ...(version === 2 ? { profileVault } : {}),
    }
  } catch {
    return null
  }
}

export interface BackupMerge {
  next: BackupSource
  added: { patterns: number; profiles: number; results: number }
  conflicts: string[]
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
  const conflicts: string[] = []
  if (current.profileVault && b.profileVault && !sameVault(current.profileVault, b.profileVault)) {
    conflicts.push('Profile vault conflict: the imported encrypted vault was not merged into the existing vault.')
  }
  if (current.profileVault && b.profiles.length > 0) conflicts.push('Unlock and merge plaintext profiles separately; restoring them into an encrypted vault would discard data.')
  if (!current.profileVault && current.profiles.length > 0 && b.profileVault) conflicts.push('Export the existing plaintext profiles before replacing them with an encrypted vault; automatic replacement is not allowed.')
  for (const p of b.patterns) {
    if (!patterns.some((x) => x.meta.name === p.meta.name)) {
      patterns.push(p)
      addedPatterns++
    } else if (JSON.stringify(patterns.find((x) => x.meta.name === p.meta.name)) !== JSON.stringify(p)) conflicts.push(`Pattern name collision: “${p.meta.name}” kept the existing item.`)
  }
  for (const f of b.profiles) {
    if (!profiles.some((x) => x.id === f.id) && !(current.profileVault && b.profileVault && !sameVault(current.profileVault, b.profileVault))) {
      profiles.push(f)
      addedProfiles++
    } else if (profiles.some((x) => x.id === f.id && JSON.stringify(x) !== JSON.stringify(f))) conflicts.push(`Profile identity collision: “${f.label}” kept the existing item.`)
  }
  for (const r of b.results) {
    if (!results.some((x) => x.id === r.id)) {
      results.push(r)
      addedResults++
    } else if (results.some((x) => x.id === r.id && JSON.stringify(x.sheet) !== JSON.stringify(r.sheet))) conflicts.push(`Sheet identity collision: “${r.id}” kept the existing item.`)
  }
  return {
    next: {
      patterns,
      profiles,
      results,
      displayUnit: b.settings.displayUnit,
      patternUnit: b.settings.patternUnit,
      activeProfileId: b.settings.activeProfileId,
      profileVault: current.profileVault ?? b.profileVault ?? null,
    },
    added: { patterns: addedPatterns, profiles: addedProfiles, results: addedResults },
    conflicts,
  }
}

/** Drafts retain incomplete source data, but never malformed renderable fields. */
export function isStoredPattern(value: unknown): value is Pattern {
  const diagnostics = validatePatternUnknown(value)
  const draft = typeof value === 'object' && value !== null && (value as Pattern).meta?.status === 'draft'
  const incomplete = new Set(['CONSTRUCTION_UNVERIFIED', 'WORKING_METHOD_UNKNOWN', 'SECTION_METHOD_UNKNOWN', 'SUM_CHECK_FAILED', 'SIZE_ARRAY_LENGTH', 'MISSING_START_CHECKPOINT', 'BAD_SCHEDULE', 'SCHEDULE_EXCEEDS_SPAN'])
  return diagnostics.every((d) => d.level !== 'error' || draft && incomplete.has(d.code))
}

export function isProfile(value: unknown): value is FitProfile {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Record<string, unknown>
  if (typeof p.id !== 'string' || typeof p.label !== 'string' || (p.displayUnit !== 'in' && p.displayUnit !== 'cm')) return false
  for (const k of ['upperTorsoIn', 'fullBustIn', 'frontHemToShoulderIn', 'backHemToShoulderIn', 'frontMidHipIn', 'backMidHipIn', 'apexToApexIn', 'shortRowStartIn', 'shortRowFinishBeforeArmholeIn']) {
    if (p[k] !== undefined && (typeof p[k] !== 'number' || !Number.isFinite(p[k]) || p[k] <= 0)) return false
  }
  return p.id.length <= 120 && p.label.length <= 200
}

export function parseVault(value: unknown): VaultEnvelope | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (v.v !== 1 || typeof v.salt !== 'string' || typeof v.iv !== 'string' || typeof v.ct !== 'string' || v.ct.length > 12 * 1024 * 1024) return null
  try {
    const validBase64 = (s: string) => /^[A-Za-z0-9+/]+={0,2}$/.test(s) && s.length % 4 === 0 && btoa(atob(s)) === s
    return [v.salt, v.iv, v.ct].every(validBase64) && atob(v.salt).length === 16 && atob(v.iv).length === 12 && atob(v.ct).length >= 16 ? value as VaultEnvelope : null
  } catch { return null }
}

function sameVault(a: VaultEnvelope, b: VaultEnvelope): boolean {
  return a.v === b.v && a.salt === b.salt && a.iv === b.iv && a.ct === b.ct
}

export function normalizeLegacyResult(value: unknown): StoredResult | null {
  if (typeof value !== 'object' || value === null || typeof (value as { id?: unknown }).id !== 'string') return null
  const r = value as Partial<StoredResult> & { id: string }
  if (typeof r.patternName !== 'string' || typeof r.sizeLabel !== 'string' || typeof r.raw !== 'string') return null
  if ((r.sheet && !isSheet(r.sheet)) || (r.validation && !isValidation(r.validation))) return null
  if (r.sheet && r.validation && isSheet(r.sheet) && isValidation(r.validation)) {
    const validation = r.validation
    const blocked = validation.status === 'blocked' || validation.dimensionChecks.some((d) => !d.pass) || validation.sumChecks.some((s) => !s.ok)
    return { ...r as StoredResult, validation: { ...validation, pass: false, status: blocked ? 'blocked' : 'advisory', reasons: [...new Set([...(validation.reasons ?? []), 'Saved sheet was not recomputed from its original pattern and fit inputs. Rerun the request for current verification.'])] } }
  }
  return null
}

function isSheet(value: unknown): value is StoredResult['sheet'] {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>
  const intents = ['size_ease_selection', 'bust_accommodation', 'body_length_change', 'sleeve_length_change', 'gauge_conversion', 'waist_shape_reposition', 'hip_width_change', 'upper_arm_width_change', 'back_neck_raise']
  return typeof s.patternId === 'string' && intents.includes(String(s.intent)) && Number.isInteger(s.sizeIndex) && (s.sizeIndex as number) >= 0 &&
    Array.isArray(s.steps) && s.steps.every((x) => {
      if (typeof x !== 'object' || x === null) return false
      const step = x as Record<string, unknown>
      return typeof step.id === 'string' && typeof step.title === 'string' && typeof step.instruction === 'string' &&
        Array.isArray(step.math) && step.math.every((m) => typeof m === 'string') && Array.isArray(step.refs) && step.refs.every((m) => typeof m === 'string')
    }) && Array.isArray(s.warnings) && s.warnings.every((x) => typeof x === 'string') && typeof s.createdAt === 'string'
}

function isValidation(value: unknown): value is StoredResult['validation'] {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return Array.isArray(v.dimensionChecks) && v.dimensionChecks.every((x) => {
    if (typeof x !== 'object' || x === null) return false
    const d = x as Record<string, unknown>
    return typeof d.dimension === 'string' && Number.isInteger(d.sizeIndex) && typeof d.targetIn === 'number' && Number.isFinite(d.targetIn) && typeof d.recomputedIn === 'number' && Number.isFinite(d.recomputedIn) && typeof d.driftIn === 'number' && Number.isFinite(d.driftIn) && typeof d.pass === 'boolean'
  }) && Array.isArray(v.sumChecks) && v.sumChecks.every((x) => typeof x === 'object' && x !== null && typeof (x as Record<string, unknown>).path === 'string' && typeof (x as Record<string, unknown>).ok === 'boolean' && typeof (x as Record<string, unknown>).detail === 'string') && typeof v.pass === 'boolean' &&
    (v.status === undefined || v.status === 'verified' || v.status === 'advisory' || v.status === 'blocked') &&
    (v.reasons === undefined || Array.isArray(v.reasons) && v.reasons.every((r) => typeof r === 'string'))
}

/** Browser-only download of a pretty-printed JSON file. */
export function downloadJson(filename: string, data: unknown): void {
  const json = serializeBackup(data)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
