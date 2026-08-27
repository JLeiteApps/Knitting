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

## Case FS3 — sleeve re-rate on a multi-event cap sleeve → GATE BLOCKS (engine TODO)
The sleeve intent assumes a single-event top-down taper (startsWith=upper arm,
endsAt=cuff). On this bottom-up cap sleeve (inc + BO + dec) it re-rates only the
cuff-CO→cap-top pair (54→32 = 11 decs over 120 rows: every 10 ×1 + every 11 ×10),
leaving Σ broken at M (54+20−8−22 = 44 ≠ 32) → **validation.pass = false, sheet
withheld**. Pinned as the current honest contract; cap-sleeve-aware re-rate is an
engine TODO.

## Case FS4 — KNOWN LIMITATION (documents current contract)
Body-length intent on FLAT pieces throws ("no body section found"): the engine's
body lookup handles `body`/`body_tube` (tube), not a flat back+front PAIR. Flat-pair
support is an engine TODO recorded in the plan.
