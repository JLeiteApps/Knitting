/**
 * Confinement worker: pdf.js runs HERE, not in the page. A compromised
 * parser lands in this worker — it has no DOM or localStorage access in this
 * flow — and talks to the page only through postMessage. IndexedDB is not a
 * security boundary for workers, so persistence is intentionally kept in the
 * page store rather than relying on worker isolation.
 */
import { extractPdfText, PdfLimitError } from './extract'

self.onmessage = async (ev: MessageEvent<{ data: Uint8Array }>) => {
  try {
    const result = await extractPdfText(ev.data.data, {
      onProgress: (done, total) => {
        void self.postMessage({ kind: 'progress', done, total })
      },
    })
    void self.postMessage({ kind: 'done', ...result })
  } catch (e) {
    void self.postMessage({
      kind: 'error',
      message: e instanceof PdfLimitError ? e.message : 'Could not read this PDF.',
    })
  }
}
