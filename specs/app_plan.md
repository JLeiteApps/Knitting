# SPEC — App Plan (approved 2026-08-24)

> The approved build plan for the web app → Android/iOS product. Decisions locked with the user:
> **Web PWA + Capacitor** (one codebase) · **Secretless BYOK relay** (user key per-request,
> never stored server-side — shipped 2026-08-27; see web README security posture)
> · **MVP = focused vertical slice** (five original intents; three golden construction families now covered).

Status reviewed 2026-08-31 against implementation commit `5dfd340`. Current
milestones and verification are in §§7–8. The [documentation status index](documentation_status.md)
records protected legacy claims retained in this plan; this sweep does not
change domain contracts or answer manual questions. See the
[source-to-code audit](domain_audit.md) for known implementation discrepancies.

## 1. Repository layout (knowledge folders untouched)
```
app/                     ← all product code
  apps/web/              Vite + React + TS PWA (UI only, no domain math)
  apps/api/              BYOK relay functions: /api/extract, /api/classify
  packages/schema/       Pattern JSON types + validators (spec: pattern_schema.md)
  packages/engine/       PURE TypeScript: all modification math + KB tables as data
  packages/parser/       PDF extraction + LLM prompt pipeline + confidence scoring
  packages/shared/       fit-profile model, modification-sheet document model, units
tests/golden/            golden patterns + hand-computed expected outputs
```
`books/`, `extracted/`, `scripts/`, `research/`, `ocr_output/`, `PaddleOCR/` stay at root as the
knowledge pipeline (gitignored: copyrighted/regenerable). **Git + .gitignore** exclude
`node_modules/`, `books/`, `extracted/`, `ocr_output/`, `research/`, `PaddleOCR/`.

## 2. Architecture rules (non-negotiable)
- **"LLM parses, code computes"**: `packages/engine` is pure TS — no I/O, no framework imports.
  Every schedule carries Σ-checks (`Σ(times×sts) = checkpoint delta`, `Σ(rows) = span`).
- **Validation gate**: only verified sheets expose instructions. Missing evidence is advisory;
  failed checks are blocked. Verification requires dimension and Σ evidence
  (drift < 0.25"/dimension); see validation_loop.md.
- **Local-first**: patterns, profiles, sheets in IndexedDB (Dexie); JSON export/import; no
  accounts in MVP. Serverless API touches nothing but LLM calls.
- **PDF extraction client-side** (pdf.js; proven in this repo); scanned PDFs flagged, no browser
  OCR in MVP.
- **Mobile-ready day 1**: responsive ≥360px, ≥44px touch targets, no hover-only UI, print
  stylesheet, custom service-worker offline shell, installable PWA.

## 3. Spec order (Phase 4 — COMPLETE)
1. ✅ `pattern_schema.md` v0.1 · 2. ✅ `parser_grammar.md` v0.1 · 3. ✅ `intent_grammar.md` v0.1
4. ✅ `engine_functions.md` (2026-08-27 — codifies the implemented engine incl. family-aware
   routes, §6 rebalancer + parity note, units) ·
5. ✅ `validation_loop.md` (2026-08-27 — two-tier gate, §13.8 recompute, golden criteria) ·
6. ✅ `app_ux.md` (2026-08-27 — descriptive spec of the shipped screens; updated 2026-08-28
   for the classifier-first Draft flow).

## 4. Engine data tables (KB → typed data)
CYC tables (§2 verified) · Budd ladders · ease tiers (VK bust + Herzog upper-torso) · EPS % ·
yoke/raglan schedules · armhole/cap algorithms · §17 policies as decision functions · Herzog
dart formulas. Open A/D decisions = config defaults (A2 inches-internal, A5 two-tier rounding,
D4 convert-with-drift, D1 diff-sheet).

## 5. MVP scope
Golden-covered constructions: top-down raglan, flat set-in and bottom-up yoke.
Construction enum membership alone does not establish modification support.
Intents: size/ease selection · bust accommodation (Herzog) · body length · sleeve length ·
gauge conversion (corrected formula; see KB §2 erratum).

## 6. Screens
Library · Add pattern (parse review w/ confidence + Σ panel) · Fit profile form (direct Herzog measurements;
favorite-garment mode remains a future UX decision) · New modification (NL → intent card → show-the-math) ·
Modification sheet (diff steps, warnings, print/export) · Validation report (drift table, Σ list).

## 7. Milestones (2026-08-31)
M0–M5 foundation is implemented: workspaces, contracts, engine, parser candidates,
web screens, BYOK relays, IndexedDB, installable PWA, security gates and backups.
The reliability batch adds encrypted-edit persistence, fresh encrypted backups,
conflict handling, visible storage failure, truthful sheet states, strict import
boundaries, explicit LLM opt-in, fixed browser PDF workers and editable drafts.

Workflow recovery was accepted at `1c63701`: tab-memory drafts survive navigation,
vault locking purges profile drafts, missing identities and stale async results
are guarded, and backup export/import use the same UTF-8 byte limit. Request
gauge entry is complete as documented in [App UX](app_ux.md).

The protected audit was accepted at `e994825` plus review correction `5dfd340`.
Its only production change is relay error privacy and response-stream cleanup;
eight transport regression tests were added. Deferred domain findings remain
open, and the user's protection rule overrides the older feature backlog.

Real Flax imports remain partial drafts; successful extraction does not establish
complete automatic instruction parsing. Four extension request forms and a
capability registry exist, but waist/hip/upper-arm/back-neck generation remains
blocked pending explicit geometry. M6/Android (roadmap step 7) is explicitly
excluded from this batch.

The garment-selection increment adds optional `Pattern.garmentKind`, a shared
legacy resolver and one Add pattern selector. Only sweaters remain implemented;
the existing capability and engine entry points block unsupported or conflicting
families before current sweater formulas run. This adds no accessory schema,
formula, parser heuristic, generic framework or new route.

## 8. Testing & QA
Use typecheck, the full Vitest suite and the production web build after edits.
See [web README](../app/apps/web/README.md) for the current suite count. Golden expectations are independently
derived, with exact Σ and <0.25-inch drift checks. Local browser review covers
body changes, real-PDF extraction/drafts, profile units/vault reload, phone layout
and offline deterministic use. No live paid API, OCR or performance benchmark was
run. Workflow browser checks also covered navigation/Back, import recovery and
vault draft purge. The later relay audit used mocked transport checks, with no
new browser or live-provider run. Latest local gates: typecheck, 273 tests across
35 files, and production web build passed. Local real-PDF tests require ignored
assets; see [golden setup](../tests/golden/README.md#local-fixtures-and-ci).

## 9. Known-gap runtime handling
G5 → st-level compensation + "unmeasured factor" warning · G2 → grade-by-table only (linear
scaling forbidden) · Shroyer §20 + C8/C9 land as engine DATA updates.

## 10. Non-goals (MVP)
Accounts/sync · crochet · storing/redistributing copyrighted text · rewritten full patterns ·
social/billing.
