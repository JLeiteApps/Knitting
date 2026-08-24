# @knitting/web — Knit Adapt (PWA shell)

Web app for the knitting pattern adaptation project: upload a pattern PDF, keep a
fit profile, request modifications in plain language, and get a deterministic,
Σ-verified modification sheet. UI only — all math lives in `@knitting/engine`;
all parsing contracts in `@knitting/parser`; the LLM proxy is `@knitting/api`
(reached via `/api`, proxied in dev to `VITE_API_TARGET`, default :8787).

## Scripts (repo root)
- `npm run dev:web` — Vite dev server (seeds the engine fixture `flaxLike` on first run)
- `npm run dev:api` — local extract-API adapter on :8787 (set `LLM_ENDPOINT` /
  `LLM_API_KEY`; without them /api returns a 502 the UI degrades from gracefully)
- `npm run build:web` — typecheck + production build
- `npm run typecheck` — whole monorepo incl. this app

## Screens
Library · Add pattern (parse review: pdf.js text layer → segment → evidence-gated
LLM extract → validate diagnostics) · Fit profile (Herzog fields) · New
modification (intent card + slot-filling gate) · Sheet (validation gate, drift
table, Σ list, print stylesheet, JSON export).

Sheets render only after every Σ-check passes and schematic drift stays under
0.25" per dimension (app plan §2). State is local-first: localStorage now,
IndexedDB/Dexie at M5.
