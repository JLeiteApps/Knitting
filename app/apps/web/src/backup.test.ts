import { describe, expect, it } from 'vitest'
import { flaxLike } from '@knitting/engine'
import type { FitProfile } from '@knitting/shared'
import { backupFilename, buildBackup, mergeBackup, parseBackup } from './backup'
import type { StoredResult } from './store'

const profile: FitProfile = { id: 'p1', label: 'Test', displayUnit: 'in' }
const result = { id: 'r1' } as unknown as StoredResult
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
})

describe('restore merge', () => {
  it('adds only items this device does not have (pattern by name, others by id)', () => {
    const secondPattern = { ...flaxLike(), meta: { ...flaxLike().meta, name: 'Other tee' } }
    const secondProfile = { id: 'p2', label: 'New', displayUnit: 'cm' as const }
    const secondResult = { id: 'r2' } as unknown as StoredResult
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
    expect(twice.next.patterns).toHaveLength(1)
  })
})
