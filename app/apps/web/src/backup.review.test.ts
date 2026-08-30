import { describe, expect, it } from 'vitest'
import { buildBackup, parseBackup } from './backup'
import { sealVault } from './vault'
import { validatePatternUnknown } from '@knitting/schema'
import { flaxLike } from '@knitting/engine'

const profile = { id: 'review-profile', label: 'Synthetic private profile', displayUnit: 'in' as const }
const source = () => ({ patterns: [flaxLike()], profiles: [profile], results: [], displayUnit: 'in' as const, patternUnit: 'in' as const, activeProfileId: profile.id })

describe('independent privacy and input-boundary review', () => {
  it('does not place decrypted profile objects in encrypted backups', async () => {
    const profileVault = await sealVault(JSON.stringify([profile]), 'synthetic-review-passphrase')
    const backup = buildBackup({ ...source(), profileVault })
    expect(backup.profileVault).toEqual(profileVault)
    expect(backup.profiles).toEqual([])
    expect(JSON.stringify(backup)).not.toContain(profile.label)
  })

  it('rejects a malformed nested saved sheet rather than accepting an advisory crash payload', () => {
    const backup = { ...buildBackup(source()), results: [{ id: 'review-result', sheet: {}, validation: {} }] }
    expect(parseBackup(JSON.stringify(backup))).toBeNull()
  })

  it('rejects negative stitch counts even if an empty event list reconciles', () => {
    const pattern = flaxLike()
    pattern.sections[0]!.startsWith.sts = pattern.sections[0]!.startsWith.sts.map(() => -1)
    pattern.sections[0]!.endsAt.sts = [...pattern.sections[0]!.startsWith.sts]
    pattern.sections[0]!.events = []
    expect(validatePatternUnknown(pattern).some((d) => d.level === 'error')).toBe(true)
  })

  it('rejects invalid working methods at the imported JSON boundary', () => {
    const pattern = flaxLike()
    Object.assign(pattern.sections[0]!, { method: 'invalid-method' })
    expect(validatePatternUnknown(pattern).some((d) => d.level === 'error')).toBe(true)
  })

  it.each([
    ['non-string size label', (p: ReturnType<typeof flaxLike>) => Object.assign(p.sizing.labels, { 0: { text: 'S' } })],
    ['unknown measurement basis', (p: ReturnType<typeof flaxLike>) => Object.assign(p.sizing, { measurementBasis: 'invented-basis' })],
    ['unknown direction', (p: ReturnType<typeof flaxLike>) => Object.assign(p.construction, { direction: 'sideways' })],
    ['unknown event type', (p: ReturnType<typeof flaxLike>) => { p.sections[0]!.events = [{ type: 'invented-event', location: 'body', perSideSts: [0, 0, 0] } as never] }],
    ['negative event stitch amounts with cancelling totals', (p: ReturnType<typeof flaxLike>) => { for (const e of p.sections[0]!.events) e.perSideSts = e.perSideSts.map(() => -1) }],
    ['negative event repetition counts with cancelling totals', (p: ReturnType<typeof flaxLike>) => { for (const e of p.sections[0]!.events) e.schedule!.times = e.schedule!.times.map(() => -1) }],
    ['inconsistent normalized row gauge', (p: ReturnType<typeof flaxLike>) => { p.gauge[0]!.rowsPerIn = 999 }],
  ])('rejects %s without throwing', (_name, mutate) => {
    const pattern = flaxLike()
    mutate(pattern)
    expect(() => validatePatternUnknown(pattern)).not.toThrow()
    expect(validatePatternUnknown(pattern).some((d) => d.level === 'error')).toBe(true)
  })
})
