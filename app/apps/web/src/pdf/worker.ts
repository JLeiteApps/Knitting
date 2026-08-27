/**
 * Confinement worker: pdf.js runs HERE, not in the page. A compromised
 * parser lands in this worker — no DOM, no IndexedDB, no localStorage —
 * and talks to the page only through postMessage.
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
