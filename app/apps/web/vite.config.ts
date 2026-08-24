import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Workspace source packages ship raw TS (package.json main → src/index.ts).
// Keep them out of the dep optimizer so Vite transforms them as source —
// esbuild resolves their `.js`-extension relative TS imports.
const KNITTING_PACKAGES = [
  '@knitting/schema',
  '@knitting/shared',
  '@knitting/parser',
  '@knitting/engine',
]

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: KNITTING_PACKAGES },
  server: {
    proxy: {
      // Dev proxy to the serverless LLM extract function (app/apps/api).
      // Point VITE_API_TARGET at a local adapter if you run one; without it
      // the proxy 500s and parse-review degrades to the notation layer.
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
