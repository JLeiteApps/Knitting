import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Pattern, Section } from '@knitting/schema'
import { validatePattern } from '@knitting/schema'
import { extractSectionCandidates } from '../src/instructions.js'
import { buildSections } from '../src/sectionBuilder.js'

/**
 * Golden: section BUILDER over the real TCK Flax text → Pattern IR sections,
 * validated Σ-clean and equal to the hand-derived ground truth
 * (tests/golden/flax-worsted/ir.ts) on the adult S/M/L/XL subset
 * (size positions 8/10/12/13 of the printed 19).
 */

const flaxText = readFileSync(join(process.cwd(), 'tests/golden/flax-worsted/text.md'), 'utf8')
const N = 19
const ADULT = [8, 10, 12, 13] // S, M, L, XL positions in the 19-size lists

function sliceSizes(section: Section): Section {
  const end = section.endsAt?.sts
    ? { event: section.endsAt.event, sts: ADULT.map((i) => section.endsAt.sts![i]!) }
    : section.endsAt
  return {
    ...section,
    startsWith: { event: section.startsWith.event, sts: ADULT.map((i) => section.startsWith.sts[i]!) },
    ...(end ? { endsAt: end } : {}),
    events: section.events.map((ev) => ({
      ...ev,
      perSideSts: ADULT.map((i) => ev.perSideSts[i]!),
      schedule: {
        ...ev.schedule!,
        intervalRows: ADULT.map((i) => ev.schedule!.intervalRows[i]!),
        times: ADULT.map((i) => ev.schedule!.times[i]!),
      },
    })),
  }
}

describe('buildSections — real Flax text → IR sections', () => {
  const candidates = extractSectionCandidates(flaxText)
  const { sections, notes } = buildSections(candidates, { sizeCount: N })

  it('emits the section flow with the split point consumed and variants kept', () => {
    expect(sections.map((s) => s.id)).toEqual([
      'neckline',
      'yoke',
      'body',
      'sleeve', // "sleeves:" — set-up round (shared start)
      'sleeve', // short sleeves (alternative variant, no shaping)
      'sleeve', // 3/4 sleeves
      'sleeve', // long sleeves
      'neckline', // neckline ribbing (finishing block)
      'finishing',
    ])
    expect(notes.some((x) => x.includes('split-point body-sts checkpoint'))).toBe(true)
  })

  it('neckline: CO 56 → +12 evenly → [68 …] (Σ clean at every size)', () => {
    const neckline = sections[0]!
    expect(neckline.startsWith.sts[0]).toBe(56)
    expect(neckline.events.length).toBe(1)
    expect(neckline.events[0]!.perSideSts[0]).toBe(6) // 12 / 2
    expect(neckline.endsAt!.sts![0]).toBe(68)
    for (let i = 0; i < N; i++) {
      expect(neckline.startsWith.sts[i]! + 2 * neckline.events[0]!.perSideSts[i]!).toBe(neckline.endsAt!.sts![i]!)
    }
  })

  it('yoke: carries the neckline result, raglan phases dedup, ends merged across phases', () => {
    const yoke = sections[1]!
    expect(yoke.startsWith.event).toBe('carry_from_previous')
    expect(yoke.startsWith.sts[8]).toBe(108) // Adult S = 108 in the [68…] list
    expect(yoke.startsWith.sts[10]).toBe(120)
    expect(yoke.startsWith.sts[13]).toBe(128)
    expect(yoke.events.length).toBe(5) // R1 + R3 + R4 + R5 + R6 brackets — each counts
    const [raglan, xlPhase] = yoke.events as NonNullable<(typeof yoke.events)[0]>[]
    expect(raglan!.perSideSts[0]).toBe(4) // [8 sts inc] / 2
    expect(raglan!.schedule!.times[8]).toBe(15) // Adult S reps
    expect(xlPhase!.schedule!.times[13]).toBe(2) // XL rounds 3-4 ×2
    expect(xlPhase!.schedule!.times[8]).toBe(0) // S untouched
    // R3 AND R4 both apply (+16/pair — proven by the printed [288] checkpoint):
    expect(yoke.events[2]!.perSideSts[13]).toBe(4)
    expect(yoke.events[3]!.perSideSts[13]).toBe(2) // [4 sts inc] rounds 5-6
    // endsAt merged: sizes 0..12 from the rounds-1-2 totals, XL+ from the phase total
    expect(yoke.endsAt!.sts![8]).toBe(228)
    expect(yoke.endsAt!.sts![12]).toBe(284)
    expect(yoke.endsAt!.sts![13]).toBe(304)
  })

  it('body: starts at the split-point counts [80 …], no events', () => {
    const body = sections[2]!
    expect(body.startsWith.event).toBe('separation')
    expect(body.startsWith.sts[8]).toBe(152) // 2 × (68 front + 8 underarm)
    expect(body.startsWith.sts[13]).toBe(208)
    expect(body.events.length).toBe(0)
  })

  it('sleeve variants share the set-up total [54 …]; Σ clean against printed cuff counts', () => {
    const setup = sections[3]!
    expect(setup.startsWith.event).toBe('pickup')
    expect(setup.startsWith.sts[8]).toBe(54) // set-up total at Adult S
    expect(setup.startsWith.sts[13]).toBe(72)

    const threeQuarter = sections[5]!
    expect(threeQuarter.startsWith.sts[8]).toBe(54) // carried from the run start
    expect(threeQuarter.events[0]!.schedule!.times[8]).toBe(5) // 3/4 dec reps at S
    expect(threeQuarter.endsAt!.sts![8]).toBe(44) // 54 − 2×5

    const longSleeve = sections[6]!
    expect(longSleeve.events.length).toBe(1)
    expect(longSleeve.events[0]!.schedule!.intervalRows[8]).toBe(7)
    expect(longSleeve.events[0]!.schedule!.times[8]).toBe(8)
    expect(longSleeve.endsAt!.sts![8]).toBe(38) // 54 − 2×8 = printed [24…] list @ S
    expect(longSleeve.endsAt!.sts![13]).toBe(46)
  })

  it('adult S/M/L/XL subset: validatePattern has ZERO errors (full Σ + span reconciliation)', () => {
    const subsetSections = sections
      .filter((s) => ['yoke', 'body', 'sleeve'].includes(s.id))
      .filter((s) => s.endsAt?.sts) // variants without a printed end are skipped by Σ anyway
      .map((s) => sliceSizes(s))
    const pattern: Pattern = {
      schemaVersion: '0.1',
      meta: { name: 'Flax builder subset', parseDate: '2026-08-26' },
      sizing: {
        labels: ADULT.map(() => 'x'),
        sizeCount: ADULT.length,
        measurementBasis: 'finished',
        bustOrChestIn: ADULT.map(() => 0),
      },
      gauge: [],
      construction: { direction: 'top_down', working: [], type: 'top_down_raglan', pieces: [] },
      schematic: [],
      stitchPatterns: [],
      sections: subsetSections,
    }
    const diags = validatePattern(pattern)
    expect(diags.filter((d) => d.level === 'error')).toEqual([])
  })
})

describe('buildSections — length statements land on sections', () => {
  it('body carries the regular-length list at all 19 sizes', () => {
    const cands = extractSectionCandidates(flaxText)
    const { sections } = buildSections(cands, { sizeCount: N })
    const body = sections.find((s) => s.id === 'body' && s.startsWith.event === 'separation')!
    expect(body.length?.in?.length).toBe(N)
    expect(body.length?.in?.[8]).toBe(13) // Adult S regular length (p.6)
    expect(body.length?.in?.[13]).toBe(16.5) // XL
  })
  it('cm declaration converts length lists /2.54', () => {
    const cands = extractSectionCandidates('body: Work in stockinette until body measures 30 (40) cm from underarm.')
    const { sections } = buildSections(cands, { sizeCount: 2, unit: 'cm' })
    expect(sections[0]!.length?.in).toEqual([Math.round((30 / 2.54) * 100) / 100, Math.round((40 / 2.54) * 100) / 100])
  })
})
