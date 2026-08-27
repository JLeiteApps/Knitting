import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractPdfText, MAX_BYTES, MAX_PAGES, PdfLimitError } from './extract'

/**
 * Security-caps tests over the REAL golden Flax PDF: pdf.js confined flags,
 * size/page caps, and the `## PDF page N` contract.
 */
const flaxPdf = readFileSync(join(process.cwd(), 'tests/golden/pdfs/FLAX-tincanknits-WORSTED.pdf'))

describe('pdf extract: confinement caps (real PDF)', () => {
  it('extracts the Flax PDF with page markers and sane text', async () => {
    const r = await extractPdfText(new Uint8Array(flaxPdf))
    expect(r.pages).toBe(8)
    expect(r.truncated).toBe(false)
    expect(r.text).toContain('## PDF page 2')
    expect(r.text).toContain('18 sts & 24 rounds / 4” in stockinette')
  })

  it('page cap truncates and reports', async () => {
    const r = await extractPdfText(new Uint8Array(flaxPdf), { maxPages: 2 })
    expect(r.pages).toBe(2)
    expect(r.truncated).toBe(true)
    expect(r.text.endsWith('## PDF page 2')).toBe(false) // page text follows the marker
    expect(r.text).toContain('## PDF page 2')
    expect(r.text).not.toContain('## PDF page 3')
  })

  it('byte cap rejects before parsing', async () => {
    await expect(
      extractPdfText(new Uint8Array(flaxPdf), { maxBytes: 1000 }),
    ).rejects.toThrow(PdfLimitError)
  })

  it('default caps are the documented security limits', () => {
    expect(MAX_BYTES).toBe(20 * 1024 * 1024)
    expect(MAX_PAGES).toBe(60)
  })
})
