import { describe, expect, it } from 'vitest'
import { applyIntent, validateAgainstSchematic } from '../src/apply'
import { flaxLike } from '../src/fixtures/flaxLike'
import type { ModificationRequest } from '@knitting/shared'

const profile = { id: 'review-fit', label: 'Synthetic review fit', displayUnit: 'in' as const, upperTorsoIn: 39, fullBustIn: 43 }
const request = (intent: ModificationRequest['intent'], params: ModificationRequest['params']): ModificationRequest => ({ intent, params, patternId: 'fixture', raw: 'independent review', sizeIndex: 0 })

describe('independent adaptation safety review', () => {
  it('does not verify stitch-balanced short rows without turn geometry', () => {
    const result = applyIntent(flaxLike(), request('bust_accommodation', { kind: 'bust', method: 'short_rows' }), {
      ...profile, frontHemToShoulderIn: 25, backHemToShoulderIn: 21,
    })
    expect(result.validation.status).not.toBe('verified')
    expect(result.validation.pass).toBe(false)
  })

  it('cannot certify a requested length whose section has no declared length', () => {
    const pattern = flaxLike()
    delete pattern.sections[0]!.length
    const result = validateAgainstSchematic(pattern, 0, { piece: 'body', inches: 19.5 })
    expect(result.status).not.toBe('verified')
    expect(result.pass).toBe(false)
  })

  it.each([NaN, Infinity, -Infinity])('rejects nonfinite body length delta %s', (deltaIn) => {
    expect(() => applyIntent(flaxLike(), request('body_length_change', { kind: 'body_length', deltaIn }), profile)).toThrow()
  })

  it.each([0, -1, NaN, Infinity])('rejects invalid gauge %s before generating a sheet', (userStsPerIn) => {
    expect(() => applyIntent(flaxLike(), request('gauge_conversion', { kind: 'gauge', userStsPerIn }), profile)).toThrow()
  })

  it('does not treat a to-fit bust table as finished garment circumference', () => {
    const pattern = flaxLike()
    pattern.sizing.measurementBasis = 'to_fit'
    pattern.schematic = []
    const run = () => applyIntent(pattern, request('size_ease_selection', { kind: 'size_ease', basis: 'bust', targetEaseIn: 0 }), profile)
    let result: ReturnType<typeof run>
    try { result = run() } catch (e) { expect(e).toBeInstanceOf(Error); return }
    expect(result.validation.status).not.toBe('verified')
    expect(result.sheet.steps.map(s => s.instruction).join(' ')).not.toMatch(/with a .*finished bust/)
  })

  it('does not verify a hip change solely because repeated hip and waist events cancel', () => {
    const pattern = flaxLike()
    pattern.sections[0]!.events[0]!.location = 'waist'
    pattern.sections[0]!.events[1]!.location = 'hip'
    let result: ReturnType<typeof applyIntent>
    try { result = applyIntent(pattern, request('hip_width_change', { kind: 'hip_width', deltaIn: 2 }), profile) }
    catch (e) { expect(e).toBeInstanceOf(Error); return }
    expect(result.validation.status).not.toBe('verified')
    expect(result.validation.pass).toBe(false)
  })

  it('does not treat a construction label as evidence of sleeve-armhole coupling', () => {
    const pattern = flaxLike()
    pattern.construction.type = 'top_down_set_in'
    let result: ReturnType<typeof applyIntent>
    try { result = applyIntent(pattern, request('upper_arm_width_change', { kind: 'upper_arm_width', deltaIn: 1 }), profile) }
    catch (e) { expect(e).toBeInstanceOf(Error); return }
    expect(result.validation.status).not.toBe('verified')
    expect(result.validation.pass).toBe(false)
  })
})
