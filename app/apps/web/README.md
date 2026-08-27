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

## Units (policy A2)
Inches are canonical internally; cm exists only at the boundaries, one exact
conversion each: pattern import ("Pattern units" dropdown — declared, never
guessed), user input (fields shown in the active unit convert ÷2.54), and
output (the engine formats lengths at string generation via fmtLen — never
post-processing). The profile's "Show measurements in" dropdown drives the UI;
the header toggle mirrors it and sticks the choice on the active profile.

## Security posture (2026-08-27 hardening)
- **PDF parsing is confined**: pdf.js runs in a dedicated worker (`isEvalSupported: false`, 20 MB / 60-page caps) — a parser compromise lands with no DOM/storage access; the page talks postMessage only.
- **No server-held secrets**: the extract relay is BYOK — your API key is sent per-request, used once, never stored anywhere but this device. Caps: 8 KB segment / 12 fields / 32 KB body; endpoints must be https.
- **LLM output is untrusted data**: strict shape validation and the verbatim-evidence gate run BEFORE any field enters app state.
- **Strict CSP** (no inline script/style) + HSTS/nosniff/DENY headers via `vercel.json`; the dev API runs in-process inside the Vite server (no second listener).
- **Opt-in profile vault**: AES-GCM at rest with a passphrase (Fit profile → Encrypt); default remains local-first plaintext, honestly labeled.
- **Dependency hygiene**: book-OCR tooling lives in `tools/` outside the app tree; CI gates on `npm audit --audit-level=high`; Renovate flags pdfjs-dist as security-priority.
