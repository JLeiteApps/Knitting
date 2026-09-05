# Golden test set — Phase 5 QA

Acceptance assets for the modification engine. A golden case = one pattern × one
intent, with **hand-computed** expected numbers derived from the knowledge base
(independent of the engine code — never generate expectations by running the
engine).

Status reviewed 2026-08-31 against `5dfd340`. Existing case contracts and
hand-derived numbers are unchanged. The [documentation status index](../../specs/documentation_status.md)
records stale historical TODOs without editing protected expectations; the
[domain audit](../../specs/domain_audit.md) records unresolved correctness risks.
Passing golden cases do not constitute complete source or geometry certification.

## Local fixtures and CI

Run `npm run typecheck`, `npm test`, and `npm run build:web` from the repository
root. The latest full local suite has 273 tests across 35 files. Three suites
also need these existing, user-supplied assets, which are deliberately ignored:

| Required local path | Consumers |
|---|---|
| `tests/golden/flax-worsted/text.md` | `app/packages/parser/test/sections.golden.test.ts`, `sectionBuilder.golden.test.ts` |
| `tests/golden/pdfs/FLAX-tincanknits-WORSTED.pdf` | `app/apps/web/src/pdf/extract.node.test.ts` |

A fresh checkout needs the user's existing local copies at those paths before
the full suite can load. Do not force-add the PDF/full-text extract, invent
replacement fixtures, skip the affected tests, or start OCR for setup. The
current GitHub CI workflow does not provision these files, so local success is
not a claim that clean-checkout CI passes. Copyright-safe CI provisioning remains
deferred (audit D-3); no CI configuration or fixture changed in this sweep.

## Acceptance criteria (per case)
- Engine output matches the hand-computed numbers exactly (stitch counts, row
  counts, inch values at 2-decimal rounding where the KB allows).
- Validation gate PASSES: every Σ-check exact, every schematic dimension drift
  < 0.25" (KB §13.8 / app plan §2).
- Where a case is expected to BLOCK (KB §6 odd-residue), the blocking message —
  not silent math — is the expected output.

## Contents
| Case | Pattern | Intent | Status |
|---|---|---|---|
| `flax-like/` | engine fixture `flaxLike()` (3-size top-down raglan, Σ-clean) | body length +2" · gauge conversion 4.5→5 sts/in · bust accommodation (vertical darts) | expectations hand-computed, wired to `app/packages/engine/test/golden.acceptance.test.ts` |
| `flax-worsted/` | **TCK Flax worsted** (real PDF, 19 sizes; IR subset S/M/L/XL hand-derived) | notation F0 · IR Σ-clean F1 · body length +2" (F2, incl. cm render) · gauge conversion 4.5→5 expected §6 BLOCK (F3) · bust darts (F4 + per-size F4b) · sleeve +2 re-rate (F5) · sleeve −2 compress (F6) | hand-derived from PDF text w/ page cites; wired to `app/packages/engine/test/golden.flax.test.ts`; found+fixed 3 parser lexicon gaps (rounds/slash gauge, sizing headers, finished-garment basis) + the `applySleeveLength` multi-size bug |
| `flat-setin-like/` | hand-designed fixture `flatSetInLike()` (3-size flat set-in, Σ-exact at every size) | size/ease (FS1) · gauge 5→5.5 expected parity BLOCK (FS2) · cap-aware sleeve re-rate (FS3) · body length on flat back+front pair (FS4) | designed + hand-computed 2026-08-27; wired to `app/packages/engine/test/golden.flatsetin.test.ts`; surfaced then verified the family-awareness engine fixes (a2da226) |
| `keith-moon-like/` | **Keith Moon** (Kate Davies *Yokes*, 2014; real book text layer, 10 sizes; IR subset 1/4/7/10 hand-derived) | IR Σ-clean (KM1) · body length on a shaped bottom-up body → plain tube only (KM2) · gauge 4.5→5 expected §6 BLOCK residue 2/step 4 (KM3) · bust darts (KM4) · bottom-up inc-taper sleeve compress every 5×1+6×10 (KM5) · size/ease w/ bust advisory (KM6) | hand-derived 2026-08-30 from `extracted/yokes_extracted.md` w/ page cites; wired to `app/packages/engine/test/golden.keithmoon.test.ts`; THIRD MVP FAMILY (bottom-up circular yoke, KB §21) — the MVP construction triangle is complete |

## Real-PDF patterns
- [x] **TCK Flax worsted** (user-downloaded 2026-08-24) → `flax-worsted/`.
- [x] Flat set-in family covered by the synthetic `flat-setin-like/` fixture
      (2026-08-27); a real flat-set-in PDF would still be a welcome cross-check.
- [x] **Yoke family covered 2026-08-30** by Keith Moon (real book, clean text
      layer — read without any OCR). The original "top-down yoke PDF" ask is
      closed in spirit (bottom-up yoke); a genuinely top-down yoke PDF remains
      an optional future cross-check.
  Then per pattern: probe text layer → parse (web AddPattern or notation
  layer) → hand-verify → expectations file + acceptance test.

## Fixture caveat (flax-like)
The fixture's body `length.rows` (120/122/124) are not gauge-exact against its
`length.in` (17.5/17.75/18 × 7 rows/in would be 123/124/126). The engine is
inch-authoritative (KB §17.2 work-to-length): `in` drives recomputation, and
`rows` is derived on modification. Pinned expectations follow that rule.

## Parser and capability caveats

The real Flax acceptance fixture is a hand-reviewed IR subset. Browser PDF
extraction now runs in the bundled worker and saves an editable partial draft,
but the instruction parser still reports unresolved sections/checkpoints for
the full PDF; the golden fixtures do not claim complete automatic parsing.
The four extension requests (waist, hip, upper-arm, and back-neck) have bounded
forms and explicit capability entries, but remain blocked until their required
geometry is represented. Generic bra-size conversion is not a golden capability
and remains blocked without measurements. Android/Capacitor is outside this
batch.
