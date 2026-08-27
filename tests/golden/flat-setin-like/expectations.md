# Golden expectations — `flatSetInLike` fixture (hand-computed)

Designed flat set-in (no published source): 3 sizes, **5 sts/in, 7 rows/in, worked flat** in
pieces. Acceptance: `app/packages/engine/test/golden.flatsetin.test.ts`.

## Section math (design, Σ-exact at every size)
- **Back/front**: CO 85 (95, 105) → armhole BO 4 (5, 6)/side + dec 1/side every 2 rows
  × 4 (5, 6) → −16 (−20, −24) → 69 (75, 81). Length 14 (14.5, 15)″.
  Chest width = CO/gauge: 85/5 = 17″, 95/5 = 19″, 105/5 = 21″ = bust/2 exactly (drift 0).
- **Sleeve**: CO 50 (54, 58) → inc 1/side every 6 rows × 9 (10, 11) → +18 (+20, +22) →
  upper arm 68 (74, 80); cap: BO 3 (4, 5)/side (−6/−8/−10) + dec 1/side every 2 rows
  × 16 (17, 18) (−32/−34/−36) → cap top 30 (32, 34). Σ: 50+18−6−32 = 30 ✓ …
  Span: taper 54 (60, 66) rows + cap 33 (35, 37) rows ≤ 126 (130, 137) ✓.

## Case FS1 — size_ease (upper torso 34″, explicit ease 2″)
- 34 + 2 = 36″ target → nearest finished bust = 34 (size S).
- Output names size S and the 34″ bust; bust ease at S = 34 − fullBust if given.

## Case FS2 — gauge conversion 5 → 5.5 sts/in → §6 BLOCK (size L)
Rebalance checks ALL sizes. S: 85→94, 69→76, residue 2 → dec times 4→5 (would pass).
M: 95→105, 75→83, residue 0 (would pass). **L: 105→116, 81→89 → 116−26 = 90 ≠ 89 →
residue 1 (odd) → THROWS** `size 2: residue 1 not divisible by 2` — the honest §6
diagnostic; parity makes it unavoidable for this design (105 odd CO must end odd).

## Case FS3 — sleeve re-rate is CAP-AWARE (FIXED 2026-08-27)
Family-aware route for bottom-up cap sleeves (inc + BO + dec): taper incs re-spaced
over (new rows − cap span); cap rows never re-rated. M: rows 130 → 120; cap span =
BO 1 + dec 2×17 = 35 → 85 taper rows for 10 incs → **every 8 ×5 + every 9 ×5**
(Σ rows 85, Σ incs 10). Inc count unchanged → Σ intact at every size; gate PASSES.

## Case FS4 — body-length on the flat back+front pair (FIXED 2026-08-27)
No tube body → the pair takes the same change on each piece: S 14″ → 16″,
98 → 112 rows on BOTH back and front; validatePattern clean; gate PASSES.
