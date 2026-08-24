/**
 * Local dev adapter for the serverless extract handler (specs/app_plan.md §2).
 * Wraps apps/api/extract.mjs in a plain http server on :8787 so the Vite dev
 * proxy (vite.config.ts → /api → localhost:8787) works without a cloud deploy.
 *
 * Usage:  LLM_ENDPOINT=... LLM_API_KEY=... npm run dev:api
 * The handler answers any method/path check itself (POST only); the web app
 * calls POST /api/extract.
 */
import http from 'node:http';
import handler from './extract.mjs';

const PORT = Number(process.env.PORT ?? 8787);

const server = http.createServer((req, res) => {
  // Serverless platforms parse JSON bodies before the handler runs; plain
  // node:http does not — do it here so req.body has the same shape.
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    if (raw) {
      try {
        req.body = JSON.parse(raw);
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'invalid JSON body' }));
        return;
      }
    }
    handler(req, res);
  });
});

server.listen(PORT, () => {
  if (!process.env.LLM_ENDPOINT || !process.env.LLM_API_KEY) {
    console.warn(
      'WARNING: LLM_ENDPOINT / LLM_API_KEY not set — /api/extract will return 502 ' +
        'and the web parse-review degrades to the notation layer (by design).',
    );
  }
  console.log(`extract API dev adapter listening on http://localhost:${PORT}`);
});
