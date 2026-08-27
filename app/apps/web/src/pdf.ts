/**
 * Client-side PDF entry: posts the raw bytes to the confinement worker and
 * never lets pdf.js touch the page context. Caps live inside the worker.
 */
export interface PdfProgress {
  done: number
  total: number
}

export async function pdfToText(
  file: File,
  onProgress?: (p: PdfProgress) => void,
): Promise<{ text: string; pages: number; truncated: boolean }> {
  const worker = new Worker(new URL('./pdf/worker.ts', import.meta.url), { type: 'module' })
  const data = new Uint8Array(await file.arrayBuffer())
  return new Promise((resolve, reject) => {
    worker.onmessage = (ev: MessageEvent) => {
      const msg = ev.data as
        | { kind: 'progress'; done: number; total: number }
        | { kind: 'done'; text: string; pages: number; truncated: boolean }
        | { kind: 'error'; message: string }
      if (msg.kind === 'progress') {
        onProgress?.({ done: msg.done, total: msg.total })
      } else if (msg.kind === 'done') {
        worker.terminate()
        resolve({ text: msg.text, pages: msg.pages, truncated: msg.truncated })
      } else {
        worker.terminate()
        reject(new Error(msg.message))
      }
    }
    worker.onerror = () => {
      worker.terminate()
      reject(new Error('Could not read this PDF.'))
    }
    void worker.postMessage({ data })
  })
}
