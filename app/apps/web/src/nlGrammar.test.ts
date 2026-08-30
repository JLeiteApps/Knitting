import { describe, expect, it } from 'vitest'
import { classifyDeterministic } from './nlGrammar'

describe('deterministic grammar — exact understanding (no LLM needed)', () => {
  it('body length with amount + direction', () => {
    const d = classifyDeterministic('make the body 2 inches longer')!
    expect(d.intent).toBe('body_length_change')
    expect(d.params).toMatchObject({ kind: 'body_length', deltaIn: 2 })
    expect(d.confidence).toBe('exact')
    expect(d.reasons).toEqual([])
  })

  it('cm converts to canonical inches in code, still exact', () => {
    const d = classifyDeterministic('3 cm longer in the body')!
    expect(d.intent).toBe('body_length_change')
    expect(d.params).toMatchObject({ deltaIn: 1.18 })
    expect(d.confidence).toBe('exact')
  })

  it('shorten sleeves with inches', () => {
    const d = classifyDeterministic('shorten the sleeves by 1.5 inches')!
    expect(d.intent).toBe('sleeve_length_change')
    expect(d.params).toMatchObject({ kind: 'sleeve_length', deltaIn: -1.5 })
    expect(d.confidence).toBe('exact')
  })

  it('gauge over-N-sts form divides in code', () => {
    const d = classifyDeterministic('convert to my gauge: 22 sts over 4 inches')!
    expect(d.intent).toBe('gauge_conversion')
    expect(d.params).toMatchObject({ kind: 'gauge', userStsPerIn: 5.5 })
    expect(d.confidence).toBe('exact')
  })

  it('explicit ease tier is exact', () => {
    const d = classifyDeterministic('I want a roomier, oversized fit')!
    expect(d.intent).toBe('size_ease_selection')
    expect(d.params).toMatchObject({ tier: 'oversized' })
    expect(d.confidence).toBe('exact')
  })

  it('bust with measurement wording is exact', () => {
    const d = classifyDeterministic('add bust darts for a fuller bust')!
    expect(d.intent).toBe('bust_accommodation')
    expect(d.confidence).toBe('exact')
  })
})

describe('deterministic grammar — probable (offer the LLM)', () => {
  it('missing amount defaults +2 with a reason', () => {
    const d = classifyDeterministic('make it longer')!
    expect(d.intent).toBe('body_length_change')
    expect(d.params).toMatchObject({ deltaIn: 2 })
    expect(d.confidence).toBe('probable')
    expect(d.reasons.join(' ')).toMatch(/No amount stated/)
  })

  it('amount without direction assumes longer with a reason', () => {
    const d = classifyDeterministic('change the body length by 2')!
    expect(d.intent).toBe('body_length_change')
    expect(d.params).toMatchObject({ deltaIn: 2 })
    expect(d.confidence).toBe('probable')
    expect(d.reasons.join(' ')).toMatch(/direction/)
  })

  it('gauge intent without a gauge number is probable', () => {
    const d = classifyDeterministic('convert the pattern to a different yarn')!
    expect(d.intent).toBe('gauge_conversion')
    expect(d.confidence).toBe('probable')
    expect(d.reasons.join(' ')).toMatch(/No stitch gauge found/)
  })

  it('cup-only phrasing is probable with the Herzog caveat', () => {
    const d = classifyDeterministic('make this bigger for a D cup')!
    expect(d.intent).toBe('bust_accommodation')
    expect(d.confidence).toBe('probable')
    expect(d.reasons.join(' ')).toMatch(/measurement path is preferred/)
  })

  it('two changes at once drafts one and explains', () => {
    const d = classifyDeterministic('make the body longer and the sleeves shorter')!
    expect(d.confidence).toBe('probable')
    expect(d.reasons.join(' ')).toMatch(/Two changes detected/)
    expect(['body_length_change', 'sleeve_length_change']).toContain(d.intent)
  })
})

describe('deterministic grammar — real-knitter fit-problem phrasings (Radcliffe §25.5 corpus)', () => {
  it('"the sleeves are too short" routes to sleeve length with known direction', () => {
    const d = classifyDeterministic('the sleeves are too short')!
    expect(d.intent).toBe('sleeve_length_change')
    expect(d.params).toMatchObject({ deltaIn: -2 })
    expect(d.confidence).toBe('probable') // no amount stated
    expect(d.reasons.join(' ')).toMatch(/No amount stated/)
  })

  it('"the body comes out too tight" routes to size/ease with a more-room reason', () => {
    const d = classifyDeterministic('the body comes out too tight')!
    expect(d.intent).toBe('size_ease_selection')
    expect(d.confidence).toBe('probable')
    expect(d.reasons.join(' ')).toMatch(/MORE room/)
  })

  it('"make the body a bit wider" is size/ease (width), NOT body length', () => {
    const d = classifyDeterministic('make the body a bit wider')!
    expect(d.intent).toBe('size_ease_selection')
    expect(d.intent).not.toBe('body_length_change')
    expect(d.reasons.join(' ')).toMatch(/post-MVP/)
  })

  it('"too loose" reads as wanting less room', () => {
    const d = classifyDeterministic('the sweater is too loose')!
    expect(d.intent).toBe('size_ease_selection')
    expect(d.reasons.join(' ')).toMatch(/LESS room/)
  })
})

describe('deterministic grammar — unclear / nothing recognized', () => {
  it('bare "bigger" asks the §11 frame-vs-cup question', () => {
    const d = classifyDeterministic('make this bigger')!
    expect(d.intent).toBe('size_ease_selection')
    expect(d.confidence).toBe('unclear')
    expect(d.reasons.join(' ')).toMatch(/FRAME.*CUP|bigger where/i)
  })

  it('"bigger size" is NOT ambiguous (explicit size word)', () => {
    const d = classifyDeterministic('knit a bigger size')!
    expect(d.intent).toBe('size_ease_selection')
    expect(d.confidence).not.toBe('unclear')
  })

  it('gibberish returns null', () => {
    expect(classifyDeterministic('hello there general kenobi')).toBeNull()
  })

  it('empty text returns null', () => {
    expect(classifyDeterministic('   ')).toBeNull()
  })
})
