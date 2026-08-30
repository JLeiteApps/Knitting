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
   spans, sizes, basis) → explicit optional LLM extract via `/api` with verbatim and field/unit evidence gates
   (kept fields + confidence chips, dropped-with-reason) → instruction layer
   (section headers, checkpoint candidates, repeats) → section builder
   (possibly incomplete sections) → editable sizing/gauge/construction review →
   diagnostics + Σ panel → save draft or accept. Library **Edit draft** preserves
   saved sections even when the original source text is unavailable.
3. **Fit profile** — Herzog fields with measurement guidance; "Show measurements
   in" dropdown; bidirectional values (typed cm → canonical inches); the active
   profile's unit drives the whole UI. **Opt-in vault**: encrypt profiles at
   rest (AES-GCM passphrase); locked banner unlocks per session. Locked profiles have no editable form.
   Unlocked vaults remain encrypted at rest; saved edits and backups use ciphertext.
   Profile encryption does not encrypt patterns or derived sheet content.
4. **New modification** — size picker (bust in active unit), profile select
   (syncs unit), free-text request → **Draft** (DETERMINISTIC-FIRST since
   2026-08-28 later: the rule grammar in `nlGrammar.ts` parses the request
   with no LLM; when it cannot claim 100% of the meaning it says why and
   offers an optional LLM pass — "Let the LLM try" (BYOK key, per request) or
   "Keep this draft") → editable intent card with slot-filling gate (missing
   measurements block Run with the KB questions; clarifying questions surface
   as notes; unsupported intents get a pick-closest prompt) → engine call.
5. **Sheet** — validation gate FIRST (verified renders steps; advisory and blocked
   states withhold instructions and explain incomplete evidence or failures), drift table (active unit), Σ list with exact
   equations, warnings (irreversible/unverified), per-step math + KB refs,
   print stylesheet with a standalone print header; the single save action is
   **Print / Save as PDF** (browser print dialog covers both). No per-sheet
   JSON export — the user-facing artifact is the PDF; data portability is the
   Library backup (below).

## Units UX (policy A2)
One header toggle (Inches/cm) mirrors and persists the active profile's choice;
lengths use the selected display unit (engine-side `fmtLen`). Gauge rates remain
per inch; equations that multiply by those rates use canonical inches explicitly
so a cm value is never multiplied by an inch-based rate.

## Offline/PWA (M5)
Installable (manifest + 192/512 icons); app-shell service worker
(network-first navigation, cache-first hashed assets, `/api` never
intercepted); Dexie durable storage with private-mode fallback.

## Backup & restore (Library "Your data" card)
Backups carry patterns, sheets and settings plus plaintext profiles in v1 or an
encrypted vault in v2. An unlocked vault is resealed from the latest saved profile
state before export; decrypted profiles are never included in a v2 backup.
Restore validates nested data, merges identities and rejects incompatible vaults
or conflicting records without replacing existing data. Identical records are
skipped. Different encrypted envelopes are not merged automatically.

History is not silently capped at fifty sheets. Reloaded/restored results are
advisory until rerun, while failed results remain blocked. The import parser has a
12 MiB character cap; exporting very large libraries needs future chunking UX.
Before clearing browser data, download a backup and retain the vault passphrase.

## Interaction conventions (2026-08-28 polish pass)
- **Destructive actions are two-tap** (`ConfirmButton`): Delete arms to
  "Confirm?" and reverts after ~3s; one accidental tap can never destroy a
  pattern or profile. Sheets (regenerable) use the same component.
- **Routine feedback is transient**: save/delete/export confirmations
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
- Modification-request gauge entry is still sts/inch. Import review accepts
  counts over an explicit inch or cm span; partial/invalid corrections block
  saving with a visible error instead of silently retaining the prior value.
- Mixed-unit patterns against the declared dropdown show up as review values
  with evidence; re-import with the other declaration.

## Reliability follow-ups
- Saving state and storage failures are visible in the app shell; keep the page
  open until saving finishes and export a backup if storage fails.
- Unsaved profile/request/import form navigation preservation remains unfinished;
  save a profile or pattern draft before leaving its screen. Locking clears the
  profile editor; saved ciphertext remains available for session unlock.
- Four extension forms disclose blocked capabilities; they do not imply supported
  geometry. Android/Capacitor is excluded from the current batch.
