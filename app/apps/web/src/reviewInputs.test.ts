import { describe, expect, it } from 'vitest'
import { validateReviewInputs } from './reviewInputs'

const blank = { labels: '', bust: '', stsOver: '', rowsOver: '', span: '' }

describe('parse-review correction gate', () => {
  it('leaves all source values unchanged when correction fields are blank', () => {
    expect(validateReviewInputs(blank, 'in', 3)).toEqual({ errors: [], labels: null, bustOrChestIn: null, gauge: null })
  })

  it('rejects partial or invalid gauge corrections instead of falling back silently', () => {
    const partial = validateReviewInputs({ ...blank, rowsOver: '24' }, 'in', 1)
    expect(partial.errors.join(' ')).toContain('stitches over span')
    expect(partial.gauge).toBeNull()
    const invalid = validateReviewInputs({ ...blank, stsOver: '0', span: '4' }, 'in', 1)
    expect(invalid.errors.join(' ')).toContain('stitches over span')
    expect(invalid.gauge).toBeNull()
  })

  it('requires entered labels to match the size count and keeps valid cm measurements canonical', () => {
    const mismatch = validateReviewInputs({ ...blank, labels: 'S, M' }, 'in', 3)
    expect(mismatch.errors.join(' ')).toContain('exactly 3 size labels')
    const valid = validateReviewInputs({ ...blank, labels: 'S, M, L', bust: '86, 91, 96', stsOver: '18', span: '10' }, 'cm', 3)
    expect(valid.errors).toEqual([])
    expect(valid.labels).toEqual(['S', 'M', 'L'])
    expect(valid.bustOrChestIn).toEqual([33.86, 35.83, 37.8])
    expect(valid.gauge?.overIn).toBeCloseTo(3.937, 3)
  })

  it('lets a valid new-source bust correction establish the effective size count', () => {
    const valid = validateReviewInputs({ ...blank, labels: 'S, M, L', bust: '34, 38, 42' }, 'in', null)
    expect(valid.errors).toEqual([])
    const reopened = validateReviewInputs({ ...blank, labels: 'S, M, L, XL', bust: '34, 38, 42, 46' }, 'in', 3)
    expect(reopened.errors.join(' ')).toContain('exactly 3 values')
  })
})
