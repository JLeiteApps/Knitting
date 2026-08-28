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
 * In-process /api middleware: the serverless handlers (BYOK relays) mounted
 * INSIDE the Vite dev server — one localhost-bound process, no second
 * listener to expose. Replaces dev-server.mjs entirely.
 */
const API_HANDLERS: Record<string, () => Promise<{ default: ApiHandler }>> = {
  '/api/extract': () => import('../../apps/api/extract.mjs'),
  '/api/classify': () => import('../../apps/api/classify.mjs'),
}

type ApiHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>

function apiMiddlewarePlugin(): Plugin {
  return {
    name: 'api-middleware',
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next) => {
        const prefix = Object.keys(API_HANDLERS).find((r) => req.url?.startsWith(r))
        if (!prefix) return next()
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
          void API_HANDLERS[prefix]().then(({ default: handler }) => handler(req, res))
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), apiMiddlewarePlugin()],
  optimizeDeps: { exclude: KNITTING_PACKAGES },
})
