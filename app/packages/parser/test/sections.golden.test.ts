import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractSectionCandidates } from '../src/instructions.js'

/**
 * Golden integration: the deterministic section-candidate extractor over the
 * REAL TCK Flax PDF text (tests/golden/flax-worsted/text.md, flattened page
 * text with site chrome mid-line). Expected numbers are the hand-derived
 * ground truth behind tests/golden/flax-worsted/ir.ts — never engine output.
 */

const GOLDEN_DIR = join(process.cwd(), 'tests/golden/flax-worsted')
const flaxText = readFileSync(join(GOLDEN_DIR, 'text.md'), 'utf8')

describe('extractSectionCandidates — real Flax PDF text', () => {
  const sections = extractSectionCandidates(flaxText)

  it('finds the Flax section flow in order', () => {
    expect(sections.map((s) => s.label)).toEqual([
      'neckline',
      'yoke',
      'separate body and sleeves',
      'body',
      'sleeves',
      'short sleeves',
      '3/4 sleeves',
      'long sleeves',
      'neckline ribbing',
      'finishing',
    ])
  })

  it('neckline: cast-on start [56 …] and post-increase checkpoint [68 …] (p.4)', () => {
    const neckline = sections[0]!
    expect(neckline.startsWith?.event).toBe('cast_on')
    expect(neckline.startsWith!.sts[0]).toBe(56)
    expect(neckline.startsWith!.sts.length).toBe(19)
    expect(neckline.endsAt?.sts[0]).toBe(68)
    expect(neckline.endsAt?.sts.length).toBe(19)
  })

  it('yoke: raglan inc event (+8, 19-size times) + total/sleeve/front-back checkpoints (p.5)', () => {
    const yoke = sections[1]!
    expect(yoke.events.length).toBeGreaterThanOrEqual(3)
    const raglan = yoke.events[0]!
    expect(raglan.type).toBe('inc')
    expect(raglan.deltaPerRound).toBe(8)
    expect(raglan.times.length).toBe(19)
    expect(raglan.times[0]).toBe(7)
    expect(raglan.times[8]).toBe(15) // Adult S
    const roles = yoke.checkpoints.map((c) => c.role)
    expect(roles).toContain('total')
    expect(roles).toContain('sleeve')
    expect(roles).toContain('front_back')
    expect(yoke.checkpoints.find((c) => c.role === 'total')!.values[0]).toBe(124)
    expect(yoke.checkpoints.find((c) => c.role === 'sleeve')!.values[0]).toBe(26)
    expect(yoke.checkpoints.find((c) => c.role === 'front_back')!.values[0]).toBe(36)
  })

  it('separation: underarm cast-on start + body sts checkpoint [80 …] (p.6)', () => {
    const sep = sections[2]!
    expect(sep.startsWith?.event).toBe('cast_on')
    expect(sep.startsWith!.sts[0]).toBe(4)
    expect(sep.checkpoints.find((c) => c.role === 'body')!.values[0]).toBe(80)
    expect(sep.checkpoints.find((c) => c.role === 'body')!.values.length).toBe(19)
  })

  it('long sleeves: dec event (2 sts, every 7 … ×3 …) + end checkpoint [24 …] (p.7)', () => {
    const longSleeve = sections[7]!
    expect(longSleeve.events.length).toBe(1)
    const dec = longSleeve.events[0]!
    expect(dec.type).toBe('dec')
    expect(dec.deltaPerRound).toBe(2)
    expect(dec.intervalRows?.[0]).toBe(7)
    expect(dec.times[0]).toBe(3)
    expect(dec.times.length).toBe(19)
    expect(longSleeve.endsAt?.sts[0]).toBe(24)
  })
})
