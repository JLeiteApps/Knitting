# SPEC — App Plan (approved 2026-08-24)

> The approved build plan for the web app → Android/iOS product. Decisions locked with the user:
> **Web PWA + Capacitor** (one codebase) · **LLM via small serverless backend now, BYOK toggle
> later** · **MVP = focused vertical slice** (2 construction families, 5 intents, full pipeline).

## 1. Repository layout (knowledge folders untouched)
```
app/                     ← all product code
  apps/web/              Vite + React + TS PWA (UI only, no domain math)
  apps/api/              serverless functions: /parse, /intent (LLM proxy)
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
- **Validation gate**: sheets render only after schematic recompute (drift < 0.25"/dimension)
  and all Σ-checks pass; failures are blocking diagnostics.
- **Local-first**: patterns, profiles, sheets in IndexedDB (Dexie); JSON export/import; no
  accounts in MVP. Serverless API touches nothing but LLM calls.
- **PDF extraction client-side** (pdf.js; proven in this repo); scanned PDFs flagged, no browser
  OCR in MVP.
- **Mobile-ready day 1**: responsive ≥360px, ≥44px touch targets, no hover-only UI, print
  stylesheet, Workbox offline, installable PWA.

## 3. Spec order (Phase 4)
1. ✅ `pattern_schema.md` v0.1 · 2. ✅ `parser_grammar.md` v0.1 · 3. ✅ `intent_grammar.md` v0.1
4. ✅ `engine_functions.md` (2026-08-27 — codifies the implemented engine incl. family-aware
   routes, §6 rebalancer + parity note, units) ·
5. ✅ `validation_loop.md` (2026-08-27 — two-tier gate, §13.8 recompute, golden criteria) —
   `app_ux.md` remains (screens already shipped; doc is descriptive polish).

## 4. Engine data tables (KB → typed data)
CYC tables (§2 verified) · Budd ladders · ease tiers (VK bust + Herzog upper-torso) · EPS % ·
yoke/raglan schedules · armhole/cap algorithms · §17 policies as decision functions · Herzog
dart formulas. Open A/D decisions = config defaults (A2 inches-internal, A5 two-tier rounding,
D4 convert-with-drift, D1 diff-sheet).

## 5. MVP scope
Constructions: top-down raglan, top-down yoke, flat set-in.
Intents: size/ease selection · bust accommodation (Herzog) · body length · sleeve length ·
gauge conversion (corrected formula; see KB §2 erratum).

## 6. Screens
Library · Add pattern (parse review w/ confidence + Σ panel) · Fit profile wizard (Herzog
protocol; favorite-garment path) · New modification (NL → intent card → show-the-math) ·
Modification sheet (diff steps, warnings, print/export) · Validation report (drift table, Σ list).

## 7. Milestones
M0 workspaces+git+lint · M1 specs 1–5 (+ machine-readable schema) · M2 schema+engine core w/
tests (property tests on Σ invariants) + golden set · M3 parser + /api + parse-review UI ·
M4 end-to-end flows · M5 PWA hardening + beta · M6 Capacitor (Android first; keys stay
server-side, out of the binary).

## 8. Testing & QA
Unit per function; property tests (Σ, interval splits); golden acceptance = exact match +
drift < 0.25" + all Σ pass; GUI smoke via browser tooling later.

## 9. Known-gap runtime handling
G5 → st-level compensation + "unmeasured factor" warning · G2 → grade-by-table only (linear
scaling forbidden) · Shroyer §20 + C8/C9 land as engine DATA updates.

## 10. Non-goals (MVP)
Accounts/sync · crochet · storing/redistributing copyrighted text · rewritten full patterns ·
social/billing.
