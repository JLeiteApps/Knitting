# Golden expectations — `flaxLike` fixture (hand-computed)

Pattern facts (from the fixture, independent of engine code):
3 sizes S/M/L, finished busts 38/42/46. Gauge 18 sts & 28 rows over 4″ =
**4.5 sts/in, 7 rows/in**, worked in the round. Top-down raglan; sections:
`body` (178/198/218 sts at join AND bind-off; 17.5/17.75/18″; events dec m1
1 st/side every 8 rows ×4 = −8 and inc m2 1 st/side every 12 rows ×4 = +8, Σ0)
and `sleeve` (46/50/54 pickup → 30/32/34 cuff; dec 1 st/side every 6/6/7 rows
×8/9/10 = −16/−18/−20 per size). Schematic: back chest width 19.75/22/24.25″.

All computations below are derived by hand from KB formulas, cited per line.
The acceptance test (`app/packages/engine/test/golden.acceptance.test.ts`)
asserts these exact values.

## Case A — body length +2″, size S (index 0) — KB §11 hem rule, §17.2
- New length: 17.5 + 2 = **19.5″** (plain span only; no shaping re-derived).
- Rows: work-to-length recompute round(19.5 × 7) = **137** rows.
- Instruction also cites round(2 × 7) = **14 rounds** as the plain add/omit count
  (fixture rows are not gauge-exact — see README caveat — inches are authoritative).
- Stitch counts untouched: Σ checks unchanged — body `178 + Σevents 0 = 178`,
  sleeve `46 + Σevents -16 = 30`.
- Schematic recompute: 178 ÷ 4.5 = 39.778″ circumference ÷ 2 = **19.78″** vs
  target 19.75 → drift **0.03″** < 0.25 (§13.8). **Gate PASSES.**

## Case B — gauge conversion 4.5 → 5 sts/in, size S — KB §2 (erratum), §6
Formula: new = old × new/old, per-count rounding (§3 two-tier [A5]).
- `convertCount`: body 178 → round(197.78) = **198** (start AND end);
  sleeve 46 → round(51.11) = **51**; cuff 30 → round(33.33) = **33**;
  per-side 1 → round(1.11) = **1** (schedule unchanged).
- §6 rebalance: body Σ −8+8 = 0 → 198 ✓ no adjustment. Sleeve Σ = −16 →
  51 − 16 = 35 ≠ 33, residue +2, divisible by 2×perSide = 2 → dec times[0]
  8 → **9** → 51 − 18 = 33 ✓.
- Primary gauge block becomes stsPerIn **5**, stsOver round(5×4) = **20**.
- Row gauge not supplied by user → rows untouched + warning "Row gauge missing
  … work-to-length (KB §17.2 step 6)".
- Schematic: 198 ÷ 5 ÷ 2 = **19.8″** vs 19.75 → drift **0.05″**. **Gate PASSES.**

### Case B′ — expected BLOCK: 4.5 → 5.5 sts/in — KB §6
Sleeve: 46 → round(56.22) = 56; cuff 30 → round(36.67) = 37; dec per-side 1 →
round(1.22) = 1, Σ −16 → 56 − 16 = 40 ≠ 37, residue **3** (odd, not divisible
by 2) → engine must THROW `sections[sleeve] size 0: residue 3 not divisible by
2 — round a checkpoint by 1 st (KB §6/§3)` — never silently broken math.

## Case C — bust accommodation, vertical darts, size S — Herzog §19.3/§19.5
Profile: upper torso 36.5″, full bust 40″, tightness average (pattern is plain
stockinette → auto picks vertical darts).
- Dart width: 40 − 36.5 − 1.5 = **2.00″** [§19.3, average subtracts 1.5].
- Per half: round(2.00 × 4.5 ÷ 2) = round(4.5) = **5 sts** per dart line.
- Σ-preserving pair: +5 sts/side bust incs (every 4 rows) and −5 sts/side neck
  decs → net 0; body endsAt stays **178**; Σ passes.
- Negative-ease compensation: finished 38 − full 40 = −2″ ease → add
  2 × ⅔ = **1.33″** body length [§19.5].
- Schematic drift 0.03″ as in Case A. **Gate PASSES.**

Known limitation (documented, non-blocking): the inserted dart events carry
perSideSts arrays of length 1 against sizeCount 3 — `validatePattern` would
flag SIZE_ARRAY_LENGTH; `validateAgainstSchematic` treats unsized entries as 0
delta. Multi-size event hygiene is an engine TODO (see plan log).
