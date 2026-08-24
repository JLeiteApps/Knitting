import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/**
 * Client-side text-layer extraction (app plan §2: PDF stays on the device).
 * Pages are tagged `## PDF page N` — the exact marker segment() expects, so
 * page numbers flow through to field provenance.
 */
export async function pdfToText(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    let text = ''
    for (const item of content.items) {
      if (!('str' in item)) continue
      text += item.str + (item.hasEOL ? '\n' : ' ')
    }
    pages.push(`## PDF page ${i}\n${text}`)
    onProgress?.(i, doc.numPages)
  }
  return pages.join('\n\n')
}
