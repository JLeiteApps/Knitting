import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { type IncomingMessage, type ServerResponse } from 'node:http'

// Workspace source packages ship raw TS (package.json main → src/index.ts).
// Keep them out of the dep optimizer so Vite transforms them as source —
// esbuild resolves their `.js`-extension relative TS imports.
const KNITTING_PACKAGES = [
  '@knitting/schema',
  '@knitting/shared',
  '@knitting/parser',
  '@knitting/engine',
]

/**
 * In-process /api/extract middleware: the serverless handler (BYOK relay)
 * mounted INSIDE the Vite dev server — one localhost-bound process, no
 * second listener to expose. Replaces dev-server.mjs entirely.
 */
function extractApiPlugin(): Plugin {
  return {
    name: 'extract-api-middleware',
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next) => {
        if (!req.url?.startsWith('/api/extract')) return next()
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          if (raw.length > 32768) {
            res.statusCode = 413
            res.end(JSON.stringify({ error: 'body too large' }))
            return
          }
          try {
            ;(req as IncomingMessage & { body: unknown }).body = JSON.parse(raw)
          } catch {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'invalid JSON body' }))
            return
          }
          void import('../../apps/api/extract.mjs').then(({ default: handler }) =>
            handler(req, res),
          )
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), extractApiPlugin()],
  optimizeDeps: { exclude: KNITTING_PACKAGES },
})
