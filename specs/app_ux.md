# SPEC — App UX (v0.1, descriptive)

> Phase 4 final deliverable (2026-08-27). DESCRIBES the shipped screens in
> `app/apps/web` — browser- and golden-verified behavior, not aspiration.
> Mobile rules (app plan §2): responsive ≥360px, ≥44px targets, no hover-only
> affordances, print stylesheet.
> UX polish pass 2026-08-28 (later): two-tap delete confirms, toast feedback
> (aria-live), browser-back/history navigation + per-screen document titles,
> plain-language diagnostics + gate explainer, AddPattern parse-summary digest
> + PDF drag-and-drop, standalone print header on sheets.

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
   (syncs unit), free-text request → **Draft** (DETERMINISTIC-FIRST since
   2026-08-28 later: the rule grammar in `nlGrammar.ts` parses the request
   with no LLM; when it cannot claim 100% of the meaning it says why and
   offers an optional LLM pass — "Let the LLM try" (BYOK key, per request) or
   "Keep this draft") → editable intent card with slot-filling gate (missing
   measurements block Run with the KB questions; clarifying questions surface
   as notes; unsupported intents get a pick-closest prompt) → engine call.
5. **Sheet** — validation gate FIRST (pass renders steps; failure withholds them
   and shows blocking diagnostics), drift table (active unit), Σ list with exact
   equations, warnings (irreversible/unverified), per-step math + KB refs,
   print stylesheet with a standalone print header; the single save action is
   **Print / Save as PDF** (browser print dialog covers both). No per-sheet
   JSON export — the user-facing artifact is the PDF; data portability is the
   Library backup (below).

## Units UX (policy A2)
One header toggle (Inches/cm) mirrors and persists the active profile's choice;
every number the user sees is born in that unit (engine-side `fmtLen`).

## Offline/PWA (M5)
Installable (manifest + 192/512 icons); app-shell service worker
(network-first navigation, cache-first hashed assets, `/api` never
intercepted); Dexie durable storage with private-mode fallback.

## Backup & restore (Library "Your data" card)
Local-first means browser storage is the only home for the user's data — the
versioned backup file (`knit-adapt-backup-YYYY-MM-DD.json`, app tag + version)
is the device-migration and clear-data insurance. Download exports everything
(patterns, profiles, sheets, settings); Restore merges it back (patterns keyed
by name, profiles/sheets by id — existing items win, duplicates skipped; the
backup's unit settings come along). Parse is strict (`backup.ts parseBackup`:
wrong app/version/shape → rejected with a toast); merge semantics are unit-
tested (`backup.test.ts`).

## Interaction conventions (2026-08-28 polish pass)
- **Destructive actions are two-tap** (`ConfirmButton`): Delete arms to
  "Confirm?" and reverts after ~3s; one accidental tap can never destroy a
  pattern or profile. Sheets (regenerable) use the same component.
- **Feedback is transient, never blocking**: save/delete/export confirmations
  render as bottom-center toasts in an `aria-live="polite"` region
  (`toast.tsx`); silent-success is avoided.
- **Navigation uses real history entries** (`pushState` + `popstate`): the
  browser/Android back button walks screens (PWA-critical); each route sets
  `document.title` ("Knit Adapt — modify *pattern*"); navigation scrolls to
  top and moves focus to `main` (keyboard/SR users land at the screen start).
- **Plain language over jargon**: validator codes render as knitter-readable
  chips (code + full message in the tooltip); the sheet gate carries a "What
  these checks mean" explainer (Σ-checks and drift in one paragraph each);
  the AddPattern review opens with a four-line parse digest (gauge · sizes ·
  sections · checks) before the technical layers.
- **Printed sheets identify themselves**: a print-only header (brand, intent,
  pattern, size, date, verification status) opens the paper artifact; the
  on-screen chrome is `no-print`.
- PDF drop zone accepts drag-and-drop (non-PDF drops get a friendly error).

## Known UX debt (honest list)
- Intent drafting is deterministic by default (2026-08-28 later, `nlGrammar.ts`)
  and browser-verified; the OPTIONAL LLM pass (`/api/classify`, BYOK key) is
  still only agent-smoke-tested — the live-key end-to-end run needs a human.
- Gauge entry is sts/inch only (sts/10cm input is a post-MVP nicety; the parser
  already normalizes cm-stated gauges at import).
- Mixed-unit patterns against the declared dropdown show up as review values
  with evidence; re-import with the other declaration.
