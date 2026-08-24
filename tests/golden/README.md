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

## Real-PDF patterns (pending)
Tin Can Knits Flax/Barley/Antler were the plan's example set, but tincanknits.com
now gates PDF downloads behind its SPA with signed URLs (verified 2026-08-24:
no static PDF links; blog funnels to the SPA; GCS bucket holds only images).
**Action for the user:** download 2–3 free pattern PDFs manually (any free,
multi-size, top-down raglan/yoke or flat set-in patterns work — e.g. from the
TCK site in a normal browser, which the button works in) into
`tests/golden/pdfs/` (gitignored). Then per pattern:
1. `node scripts/probe_text.js <pdf>` — confirm a text layer exists.
2. Run the AddPattern parse flow (web app) or parser notation layer directly.
3. Hand-verify sizes list, gauge line, section order, key counts.
4. Add an expectations file + extend the acceptance test.

## Fixture caveat (flax-like)
The fixture's body `length.rows` (120/122/124) are not gauge-exact against its
`length.in` (17.5/17.75/18 × 7 rows/in would be 123/124/126). The engine is
inch-authoritative (KB §17.2 work-to-length): `in` drives recomputation, and
`rows` is derived on modification. Pinned expectations follow that rule.
