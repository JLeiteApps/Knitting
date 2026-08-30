import { describe, expect, it } from 'vitest'
import { flaxLike } from '@knitting/engine'
import type { FitProfile } from '@knitting/shared'
import { backupFilename, buildBackup, mergeBackup, parseBackup } from './backup'
import type { StoredResult } from './store'
import { sealVault } from './vault'

const profile: FitProfile = { id: 'p1', label: 'Test', displayUnit: 'in' }
const result: StoredResult = {
  id: 'r1', patternName: 'Test pattern', sizeLabel: 'S', raw: 'test request',
  sheet: { patternId: 'test', intent: 'body_length_change', sizeIndex: 0, steps: [], warnings: [], createdAt: '2026-08-30T00:00:00Z' },
  validation: { dimensionChecks: [], sumChecks: [], status: 'advisory', pass: false, reasons: ['No recomputable geometry'] },
}
const source = {
  patterns: [flaxLike()],
  profiles: [profile],
  results: [result],
  displayUnit: 'in' as const,
  patternUnit: 'cm' as const,
  activeProfileId: 'p1' as string | null,
}

describe('backup file format', () => {
  it('round-trips through JSON with counts and settings preserved', () => {
    const file = buildBackup(source)
    const back = parseBackup(JSON.stringify(file))
    expect(back).not.toBeNull()
    expect(back!.patterns).toHaveLength(1)
    expect(back!.profiles).toHaveLength(1)
    expect(back!.results).toHaveLength(1)
    expect(back!.settings).toEqual({ displayUnit: 'in', patternUnit: 'cm', activeProfileId: 'p1' })
  })

  it('rejects garbage, wrong app tag, wrong version, and missing arrays', () => {
    expect(parseBackup('not json at all')).toBeNull()
    expect(parseBackup('{"app":"other","version":1}')).toBeNull()
    expect(parseBackup(JSON.stringify({ ...buildBackup(source), version: 2 }))).toBeNull()
    expect(parseBackup(JSON.stringify({ ...buildBackup(source), results: undefined }))).toBeNull()
  })

  it('defaults unknown settings fields to safe values', () => {
    const back = parseBackup('{"app":"knit-adapt","version":1,"patterns":[],"profiles":[],"results":[]}')
    expect(back!.settings).toEqual({ displayUnit: 'in', patternUnit: 'in', activeProfileId: null })
  })

  it('filename is dated and human-readable', () => {
    expect(backupFilename()).toMatch(/^knit-adapt-backup-\d{4}-\d{2}-\d{2}\.json$/)
  })

  it('round-trips a history with more than one hundred sheets', () => {
    const results = Array.from({ length: 120 }, (_, i) => ({ ...result, id: `history-${i}` }))
    expect(parseBackup(JSON.stringify(buildBackup({ ...source, results })))?.results).toHaveLength(120)
  })

  it('never weakens a saved blocked result to advisory', () => {
    const blocked = { ...result, validation: { ...result.validation, status: 'blocked' as const } }
    expect(parseBackup(JSON.stringify(buildBackup({ ...source, results: [blocked] })))?.results[0]?.validation.status).toBe('blocked')
  })

  it('rejects malformed saved sheets rather than manufacturing placeholder instructions', () => {
    expect(parseBackup(JSON.stringify({ ...buildBackup(source), results: [{ id: 'broken' }] }))).toBeNull()
    expect(parseBackup(JSON.stringify({ ...buildBackup(source), results: [{ ...result, validation: { ...result.validation, reasons: [{}] } }] }))).toBeNull()
  })

  it('round-trips an incomplete draft without accepting malformed size labels', () => {
    const draft = flaxLike()
    draft.meta.status = 'draft'
    draft.sections[0]!.endsAt.sts![0] += 2 // known unresolved source checkpoint
    expect(parseBackup(JSON.stringify(buildBackup({ ...source, patterns: [draft] })))).not.toBeNull()
    Object.assign(draft.sizing.labels, { 0: { malicious: 'not a renderable label' } })
    expect(parseBackup(JSON.stringify(buildBackup({ ...source, patterns: [draft] })))).toBeNull()
  })

  it('preserves explicitly unknown draft working methods but rejects arbitrary invalid methods', () => {
    const draft = flaxLike()
    draft.meta.status = 'draft'
    draft.gauge[0]!.worked = 'unknown'
    draft.sections[0]!.method = 'unknown'
    expect(parseBackup(JSON.stringify(buildBackup({ ...source, patterns: [draft] })))).not.toBeNull()
    Object.assign(draft.sections[0]!, { method: 'invalid-import-value' })
    expect(parseBackup(JSON.stringify(buildBackup({ ...source, patterns: [draft] })))).toBeNull()
    draft.sections[0]!.method = 'unknown'
    Object.assign(draft.gauge[0]!, { worked: { invalid: true } })
    expect(parseBackup(JSON.stringify(buildBackup({ ...source, patterns: [draft] })))).toBeNull()
  })

  it('rejects mixed plaintext/ciphertext v2 backups and malformed vault encodings', async () => {
    const profileVault = await sealVault(JSON.stringify([profile]), 'synthetic-test-pass')
    const file = buildBackup({ ...source, profileVault })
    expect(parseBackup(JSON.stringify(file))).not.toBeNull()
    expect(parseBackup(JSON.stringify({ ...file, profiles: [profile] }))).toBeNull()
    expect(parseBackup(JSON.stringify({ ...file, profileVault: { ...profileVault, iv: 'invalid' } }))).toBeNull()
  })
})

describe('restore merge', () => {
  it('adds only items this device does not have (pattern by name, others by id)', () => {
    const secondPattern = { ...flaxLike(), meta: { ...flaxLike().meta, name: 'Other tee' } }
    const secondProfile = { id: 'p2', label: 'New', displayUnit: 'cm' as const }
    const secondResult = { ...result, id: 'r2' }
    const file = buildBackup({
      ...source,
      patterns: [flaxLike(), secondPattern],
      profiles: [profile, secondProfile],
      results: [result, secondResult],
      displayUnit: 'cm',
      patternUnit: 'in',
      activeProfileId: 'p2',
    })
    const { next, added } = mergeBackup(source, file)
    expect(added).toEqual({ patterns: 1, profiles: 1, results: 1 })
    expect(next.patterns.map((p) => p.meta.name)).toEqual([
      flaxLike().meta.name,
      'Other tee',
    ])
    expect(next.profiles).toHaveLength(2)
    expect(next.results).toHaveLength(2)
    // Restoring brings the backup's preferences along (fresh-device behavior).
    expect(next.displayUnit).toBe('cm')
    expect(next.patternUnit).toBe('in')
    expect(next.activeProfileId).toBe('p2')
  })

  it('restoring the same backup twice adds nothing the second time', () => {
    const file = buildBackup(source)
    const once = mergeBackup(
      { patterns: [], profiles: [], results: [], displayUnit: 'in', patternUnit: 'in', activeProfileId: null },
      file,
    )
    const twice = mergeBackup(once.next, file)
    expect(once.added).toEqual({ patterns: 1, profiles: 1, results: 1 })
    expect(twice.added).toEqual({ patterns: 0, profiles: 0, results: 0 })
    expect(twice.conflicts).toEqual([])
    expect(twice.next.patterns).toHaveLength(1)
  })
})
