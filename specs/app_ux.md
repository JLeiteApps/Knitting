# SPEC — App UX (v0.1, descriptive)

> Phase 4 final deliverable (2026-08-27). DESCRIBES the shipped screens in
> `app/apps/web` — browser- and golden-verified behavior, not aspiration.
> Mobile rules (app plan §2): responsive ≥360px, ≥44px targets, no hover-only
> affordances, print stylesheet.

## Screens & flows
1. **Library** — pattern cards (construction, sizes, bust range in the active
   unit, gauge, basis) with validation chips (`Σ clean` / errors / `NO_SCHEMATIC`
   / draft); sheet history with per-sheet gate status. Local-first: state lives
   on-device (Dexie + localStorage bootstrap cache; M5).
2. **Add pattern → parse review** — staged pipeline over the pasted/uploaded
   text: optional **BYOK LLM key field** (device-only, per-request; enables
   LLM-assisted fields) → "Pattern units" dropdown (in/cm — DECLARED, never
   detected) → pdf.js **confined-worker** text extraction (20 MB / 60-page
   caps; scanned pages flagged) → notation layer (gauge incl. metric
   spans, sizes, basis) → LLM extract via `/api` with the verbatim-evidence gate
   (kept fields + confidence chips, dropped-with-reason) → instruction layer
   (section headers, checkpoint candidates, repeats) → section builder
   (Σ-validated sections incl. lengths) → diagnostics + Σ panel → save.
3. **Fit profile** — Herzog fields with measurement guidance; "Show measurements
   in" dropdown; bidirectional values (typed cm → canonical inches); the active
   profile's unit drives the whole UI. **Opt-in vault**: encrypt profiles at
   rest (AES-GCM passphrase); locked banner unlocks per session.
4. **New modification** — size picker (bust in active unit), profile select
   (syncs unit), free-text request → heuristic draft (placeholder for the /api
   classifier) → editable intent card with slot-filling gate (missing
   measurements block Run with the KB questions) → engine call.
5. **Sheet** — validation gate FIRST (pass renders steps; failure withholds them
   and shows blocking diagnostics), drift table (active unit), Σ list with exact
   equations, warnings (irreversible/unverified), per-step math + KB refs,
   print stylesheet, JSON export (canonical inches).

## Units UX (policy A2)
One header toggle (Inches/cm) mirrors and persists the active profile's choice;
every number the user sees is born in that unit (engine-side `fmtLen`).

## Offline/PWA (M5)
Installable (manifest + 192/512 icons); app-shell service worker
(network-first navigation, cache-first hashed assets, `/api` never
intercepted); Dexie durable storage with private-mode fallback.

## Known UX debt (honest list)
- Intent drafting is heuristic offline; the /api classifier (BYOK key) is the
  next queue item.
- Gauge entry is sts/inch only (sts/10cm input is a post-MVP nicety; the parser
  already normalizes cm-stated gauges at import).
- Mixed-unit patterns against the declared dropdown show up as review values
  with evidence; re-import with the other declaration.
