import { describe, expect, it } from 'vitest'
import { applyIntent } from '../src/apply.js'
import { capabilityFor } from '../src/capability.js'
import { flaxLike } from '../src/fixtures/flaxLike.js'
import type { FitProfile, ModificationRequest } from '@knitting/shared'

const profile: FitProfile = { id: 'garment-test', label: 'Synthetic', displayUnit: 'in' }
const request: ModificationRequest = {
  intent: 'body_length_change', patternId: 'fixture', raw: 'make it longer',
  params: { kind: 'body_length', deltaIn: 1 },
}

describe('garment eligibility boundary', () => {
  it('keeps legacy sweater output identical to an explicit sweater identity', () => {
    const legacy = flaxLike()
    const explicit = { ...flaxLike(), garmentKind: 'sweater' as const }
    const legacyResult = applyIntent(legacy, request, profile)
    const explicitResult = applyIntent(explicit, request, profile)
    expect(explicitResult.sheet.steps).toEqual(legacyResult.sheet.steps)
    expect(explicitResult.validation).toEqual(legacyResult.validation)
    expect(explicitResult.modified.garmentKind).toBe('sweater')
  })

  it.each([
    ['accessory', () => {
      const pattern = flaxLike()
      return { ...pattern, garmentKind: 'sock' as const, construction: { ...pattern.construction, type: 'accessory_sock' as const } }
    }],
    ['trousers', () => ({ ...flaxLike(), garmentKind: 'trousers' as const })],
    ['unknown', () => ({ ...flaxLike(), garmentKind: 'unknown' as const })],
    ['conflicting identity', () => ({ ...flaxLike(), garmentKind: 'sock' as const })],
  ])('blocks %s before any sweater instructions are produced', (_name, makePattern) => {
    const pattern = makePattern()
    expect(capabilityFor(request.intent, pattern).status).toBe('blocked')
    expect(() => applyIntent(pattern, request, profile)).toThrow(/unavailable for modification/)
  })
})
