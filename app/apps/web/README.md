# @knitting/web — Knit Adapt (PWA shell)

Web app for the knitting pattern adaptation project: upload a pattern PDF, keep a
fit profile, request modifications in plain language, and get a deterministic
modification sheet with an explicit verified, advisory, or blocked status. UI
only — all math lives in `@knitting/engine`;
all parsing contracts in `@knitting/parser`; the BYOK LLM relays live in
`@knitting/api` (`/api/extract` + `/api/classify`). In dev, an in-process Vite
middleware (`vite.config.ts`) mounts the same serverless handlers — no second
listener; in prod, `vercel.json` routes them as serverless functions.

## Scripts (repo root)
- `npm run dev:web` — Vite dev server (seeds the engine fixture `flaxLike` on
  first run; `/api/*` served in-process by the middleware above)
- `npm run build:web` — typecheck + production build
- `npm run typecheck` — whole monorepo incl. this app
- `npm test` — full suite (231 tests currently across schema/engine/parser/web)

## Screens
Library · Add pattern (parse review: dedicated pdf.js worker → notation →
evidence-gated LLM extract → section builder → validate diagnostics; opens with
a plain-language parse digest; PDFs drag-and-droppable; saved drafts can be
reopened with their existing IR preserved) · Fit profile (Herzog fields,
opt-in AES-GCM vault) · New modification (deterministic-first Draft:
the rule grammar in `nlGrammar.ts` parses the request with no LLM and reports
confidence; when it isn't 100% sure it explains why and offers an optional
LLM pass via `/api/classify`; editable intent card + slot-filling gate) ·
Sheet (validation gate + "what these checks mean"
explainer, drift table, Σ list, Print / Save as PDF with a standalone print
header) · Library "Your data" (versioned JSON backup + restore — the
local-first device-migration path; merge semantics unit-tested in
`backup.test.ts`).

UX conventions: destructive actions are two-tap ("Delete" → "Confirm?",
auto-reverting); saves/deletes/exports confirm via aria-live toasts; the
browser/Android back button walks screens (history-aware routing) and every
screen sets its own document title; validator diagnostics render as
plain-language chips with the code in the tooltip.

Only verified sheets are presented as ready-to-knit instructions: they need at
least one recomputed requested dimension, exact Σ checks, and drift below 0.25"
where that geometry is supported. Advisory sheets explain missing evidence;
blocked sheets explain failed or unsupported checks. State is local-first:
Dexie/IndexedDB durable storage with a localStorage bootstrap cache; installable
PWA (manifest + app-shell service worker; `/api` never intercepted). Saved
history is advisory until its original pattern/profile inputs are rerun.

## Units (policy A2)
Inches are canonical internally; cm exists only at the boundaries, one exact
conversion each: pattern import ("Pattern units" dropdown — declared, never
guessed), user input (fields shown in the active unit convert ÷2.54), and
output (the engine formats lengths at string generation via fmtLen — never
post-processing). The profile's "Show measurements in" dropdown drives the UI;
the header toggle mirrors it and sticks the choice on the active profile.

## Security posture (2026-08-27 hardening)
- **PDF parsing uses a dedicated worker**: pdf.js runs off the page (`isEvalSupported: false`, 20 MB / 60-page caps), with no DOM or localStorage access. Workers can access IndexedDB, so this is not a complete storage-security boundary; the application keeps persistence in the page store and communicates through postMessage.
- **No server-held secrets**: the extract + classify relays are BYOK — your API key is sent per-request, used once, never stored anywhere but this device. Caps: 8 KB segment / 12 fields / 32 KB body (extract), 2000-char raw request (classify); endpoints must be https.
- **LLM output is untrusted data**: strict shape validation and the verbatim-evidence gate (extract) / pre-state intent gate with the absent-not-trusted NaN rule (classify) run BEFORE any field enters app state.
- **Strict CSP** (no inline script/style) + HSTS/nosniff/DENY headers via `vercel.json` — CSP is header-only since 2026-08-28 (the meta-tag form broke Vite's dev styling); the dev API runs in-process inside the Vite server (no second listener).
- **Opt-in profile vault**: AES-GCM at rest with a passphrase (Fit profile →
  Lock profiles); while unlocked, decrypted measurements exist only in the
  session and are re-sealed on each durable write. The default local-first mode
  is plaintext and labeled as such.
- **Dependency hygiene**: book-OCR tooling lives in `tools/` outside the app tree; CI gates on `npm audit --audit-level=high`; Renovate flags pdfjs-dist as security-priority.

## Bounded scope

The original five intents are deterministic and tested. The registry also
exposes waist-shape reposition, hip width, upper-arm width, and back-neck raise
request forms, but every one remains blocked until its required geometry and
evidence contract exists; a Σ-balanced placeholder is never emitted. Generic
bra-size-to-measurement conversion is unsupported, so cup-size-only requests
remain blocked pending measurements. The current batch covers vault/backup
hardening, truthful validation statuses, browser PDF worker delivery, editable
partial drafts, and offline/browser QA. Android/Capacitor work is explicitly
excluded from this batch; the Flax PDF parser is still partial and is not
claimed to be a full instruction parser. No paid API calls, OCR runs, or
performance benchmarks are part of the app workflow.
