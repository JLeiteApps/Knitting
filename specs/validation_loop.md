# SPEC — Validation Loop (v0.1)

> Phase 4 deliverable 5 of 5. The recompute-and-verify loop that gates every
> modification sheet (app plan §2: "sheets render only after schematic recompute
> and all Σ-checks pass; failures are blocking diagnostics"). Implemented in
> `schema/validate.ts` + `engine/apply.ts`; acceptance = the golden suite.

## 1. Two tiers, two jobs
| Tier | Function | Scope | Effect |
|---|---|---|---|
| IR validation | `validatePattern(pattern)` | ALL sizes: array lengths vs `sizeCount`, per-section Σ (`start + Σevents = end` at every size), schedule-span (`interval×times + variant rows ≤ section rows`), gauge normalization, stitch-pattern refs | diagnostics list (parse review + golden acceptance); errors block "accepted" status |
| Sheet gate | `validateAgainstSchematic(modified, sizeIndex)` | the REQUESTED size: schematic drift + Σ | `pass=false` ⇒ the UI withholds steps entirely |

## 2. Schematic recompute (KB §13.8)
For every schematic dimension of a piece with a matching section:
- `width_at_chest`: recomputed = `section.startsWith.sts[i] / gauge.stsPerIn`;
  tube sections (body/body_tube) hold the full circumference → **halved** for
  back/front schematic dims (piece × 2 = pullover bust).
- drift = |target − recomputed|; PASS ⇔ drift < **0.25″** (§17.2 tolerance).
- Dimensions without a recompute rule are advisory-skipped (documented, not guessed).

## 3. Σ reconciliation
Per section (gate: requested size; schema: every size):
`Σevents = Σ perSideSts[i] × 2 × (times[i] + variantTimes[i])` over inc/dec/BO/CO
events (short-rows/markers/divides contribute 0 by design). Check:
`start + Σevents = end`, EXACT integer equality. Diagnostics carry the full
equation (`178 + Σevents 0 = 178`) — the same strings appear in golden tests.

## 4. The loop in one pass
```
request → applyIntent (compute, Σ-preserving by construction)
        → §6 rebalance inside conversions (residue absorbed or THROWN)
        → validateAgainstSchematic(modified, sizeIndex)
        → pass ? render sheet (steps + drift table + Σ list)
                : render BLOCKING diagnostics (sheet withheld)
```
Post-modification IRs are additionally run through `validatePattern` in golden
tests (`validatePattern(modified) = []`) — the product bar: a modification must
leave the WHOLE pattern clean at every size, not just the requested one.

## 5. Golden acceptance criteria (plan Phase 5 QA; implemented)
Exact match against hand-computed numbers (never engine-derived); drift < 0.25″
per dimension; every Σ exact; expected-BLOCK cases assert the §6 diagnostic
message (Flax F3, flat-setin FS2). Current coverage: flax-like (3 intents + §6
block), Flax real-PDF (notation/IR/5 intent cases incl. cm), flat set-in
(family-aware body/sleeve, parity block).

## 6. Known limitations (documented contracts)
- The gate checks the requested size only; cross-size cleanliness is the schema
  tier's job (and the golden bar).
- Advisory mode: patterns without schematic/sections gate on Σ alone
  (NO_SCHEMATIC warning at parse).
- Dart insertion pre-dates per-size arrays in older fixtures — current engine
  writes full arrays (flat-setin F4b regression).
