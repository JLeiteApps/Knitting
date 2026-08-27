/**
 * PDF text extraction core — deliberately importable from a Web Worker AND
 * from node tests (pdfjs-dist resolves per environment). Security posture:
 *  - isEvalSupported: false — kills pdf.js's embedded-font eval vector
 *    (GHSA-wgrm-67xf-hhpq) even on vulnerable parser versions;
 *  - hard caps on input size and page count — a hostile/bomb PDF can only
 *    cost the caller the cap, never unbounded time or memory.
 */
import * as pdfjsLib from 'pdfjs-dist'

export const MAX_BYTES = 20 * 1024 * 1024 // 20 MB
export const MAX_PAGES = 60

export interface ExtractOptions {
  maxBytes?: number
  maxPages?: number
  onProgress?: (done: number, total: number) => void
}

export interface ExtractResult {
  /** Page texts tagged `## PDF page N` — the exact marker segment() expects. */
  text: string
  pages: number
  truncated: boolean
}

export class PdfLimitError extends Error {}

export async function extractPdfText(
  data: Uint8Array,
  opts: ExtractOptions = {},
): Promise<ExtractResult> {
  const maxBytes = opts.maxBytes ?? MAX_BYTES
  const maxPages = opts.maxPages ?? MAX_PAGES
  if (data.byteLength > maxBytes) {
    throw new PdfLimitError(`PDF is ${Math.round(data.byteLength / 1e6)} MB — the limit is ${Math.round(maxBytes / 1e6)} MB.`)
  }
  const doc = await pdfjsLib.getDocument({
    data,
    isEvalSupported: false, // never eval embedded programs (CVE-2024-4367 family)
    disableAutoFetch: true,
    disableStream: true,
  }).promise
  const total = Math.min(doc.numPages, maxPages)
  const pages: string[] = []
  try {
    for (let i = 1; i <= total; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      let text = ''
      for (const item of content.items) {
        if (!('str' in item)) continue
        text += item.str + (item.hasEOL ? '\n' : ' ')
      }
      pages.push(`## PDF page ${i}\n${text}`)
      opts.onProgress?.(i, total)
    }
  } finally {
    void doc.destroy()
  }
  return {
    text: pages.join('\n\n'),
    pages: total,
    truncated: doc.numPages > total,
  }
}
