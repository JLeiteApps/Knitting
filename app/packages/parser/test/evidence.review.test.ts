import { describe, expect, it } from 'vitest'
import { enforceEvidence } from '../src/llmExtract'

describe('independent extraction evidence review', () => {
  const text = 'Gauge: 18 sts and 24 rows over 4 inches.'
  it('rejects invented values even when the supporting quotation is real', () => {
    const result = enforceEvidence([{ path: 'gauge.sts', value: 26, confidence: 'high', evidence: text }], text)
    expect(result.kept).toEqual([])
  })
  it('does not accept the row count as the stitch count merely because it occurs in the quotation', () => {
    const result = enforceEvidence([{ path: 'gauge.sts', value: 24, confidence: 'high', evidence: text }], text)
    expect(result.kept).toEqual([])
  })
})
