# Golden test set — Phase 5 QA

Acceptance assets for the modification engine. A golden case = one pattern × one
intent, with **hand-computed** expected numbers derived from the knowledge base
(independent of the engine code — never generate expectations by running the
engine).

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
| `flax-worsted/` | **TCK Flax worsted** (real PDF, 19 sizes; IR subset S/M/L/XL hand-derived) | notation-layer F0 · body length +2" (F2) · gauge conversion 4.5→5 expected §6 BLOCK (F3) · bust darts (F4) | hand-derived from PDF text w/ page cites; wired to `app/packages/engine/test/golden.flax.test.ts`; found+fixed 3 parser lexicon gaps (rounds/slash gauge, sizing headers, finished-garment basis) |

## Real-PDF patterns
- [x] **TCK Flax worsted** (user-downloaded 2026-08-24) → `flax-worsted/`.
- [ ] 1–2 more constructions: a top-down YOKE and a FLAT SET-IN free pattern
      would cover the remaining MVP families (any free multi-size PDF works;
      TCK downloads need a normal browser — the SPA gates bots).
  Then per pattern: probe text layer → parse (web AddPattern or notation
  layer) → hand-verify → expectations file + acceptance test.

## Fixture caveat (flax-like)
The fixture's body `length.rows` (120/122/124) are not gauge-exact against its
`length.in` (17.5/17.75/18 × 7 rows/in would be 123/124/126). The engine is
inch-authoritative (KB §17.2 work-to-length): `in` drives recomputation, and
`rows` is derived on modification. Pinned expectations follow that rule.
