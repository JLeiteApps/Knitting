# Golden expectations — TCK Flax (worsted) — hand-derived from the PDF

Source: `tests/golden/pdfs/FLAX-tincanknits-WORSTED.pdf` (user-downloaded;
© Tin Can Knits — free pattern, kept out of git). Full text extract:
`text.md` (page-tagged). IR subset: adult **S / M / L / XL** = positions
9 / 11 / 13 / 14 of the 19-size lists. Acceptance test:
`app/packages/engine/test/golden.flax.test.ts`.

## Pattern facts (verbatim from the PDF)
- **Gauge (p.2):** "18 sts & 24 rounds / 4″ in stockinette on larger needles"
  → 4.5 sts/in, **6 rounds/in** (in the round).
- **Sizing table (p.3):** "lists finished garment measurements" → basis
  `finished`. Finished chest: S 34″, M 38″, L 42″, XL 46″ (col a). Top sleeve
  (d): 12/13/15/16″. Yoke depth front (e): 12/13/15/16″.
- **Construction (p.4):** seamless, in the round, top down, raglan increases.
- Page 8 has no text layer (photo page) — `looksScanned` flags it.

## Section checkpoints (per-size arrays = S, M, L, XL)
- **Yoke start** (p.4 neckline increase result): 108 (…, 120, …, 124, 128)
  → [108, 120, 124, 128].
- **Yoke end** (p.5 totals at separation): [228, 248, 284, 304].
  - R1-2 reps ×15/16/20/16 at +8 sts → perSide 4 × 2 sides.
  - XL only: R3-4 ×2 at +16 (perSide 8) and R5-6 ×2 at +8 (perSide 4).
  - Σ: S 108+120=228 · M 120+128=248 · L 124+160=284 · XL 128+128+32+16=304.
- **Body start** (p.6 separation): 2 × (front 68/76/84/92 + underarm CO
  8/10/10/12) = [152, 172, 188, 208]; endsAt same (bind off; no shaping —
  plain stockinette tube + 2″ rib modeled as finishing).
  Regular length c2 (p.6) minus 2″ rib: [13, 14, 16, 16.5]″ (rows ×6:
  [78, 84, 96, 99]).
- **Sleeve** (p.6 set-up, p.7 long sleeves): held 46/48/58/60 + pickups
  2×(4/5/5/6) → [54, 58, 68, 72]; taper end [38, 40, 42, 46]; dec round
  [2 sts] every 7/7/6/6 rounds × 8/9/13/13; length 17/18/19/19″ from underarm.
  - Σ: 54−16=38 · 58−18=40 · 68−26=42 · 72−26=46.
- Schematic recompute (§13.8, tube halved): 152/4.5/2 = 16.89″ vs S target 17″
  → drift 0.11″; same 0.11″ at M (19.11 vs 19), L (20.89 vs 21), XL (23.11 vs
  23) — all < 0.25″.

## Case F0 — notation layer on verbatim lines (regression-locked)
`parseGaugeStatement` must read the rounds/slash phrasing (4.5 sts/in, 6
rounds/in); `segment` classifies "sizing notes:"/"sizing table:" blocks;
`detectMeasurementBasis` reads "finished garment measurements" → finished.
*(These three were lexicon gaps found by this golden case — parser fixed
2026-08-24.)*

## Case F2 — body length +2″, size M — KB §11/§17.2
- 14 + 2 = **16″**; rows round(16 × 6) = **96**; instruction cites
  round(2 × 6) = **12 rounds** (plain span, no shaping to re-derive).
- Σ unchanged: yoke `120 + 128 = 248`, body `172 + 0 = 172`,
  sleeve `58 − 18 = 40`. Chest drift M = **0.11″**. **Gate PASSES.**

## Case F3 — gauge conversion 4.5→5 sts/in — KB §6 BLOCK (real data)
Convert (new = old × 5/4.5, per-count rounding), yoke first:
- starts 120→133, 124→138, 128→142 (S checked first: 108→120);
- ends 228→253, 248→276, 284→316, 304→338;
- per-side 4→round(4.44)=4 (e2's 8→9).
- Size S: 120 + 120 = 240 vs 253 → residue **−13**, step 2×4 = 8 →
  **THROWS** `sections[yoke] size 0: residue -13 not divisible by 8` — the
  honest §6 diagnostic on a real pattern (checkpoints need 1-st nudges).
- (M would be −15, L −18, XL −16 — S fails first.)

## Case F4 — bust vertical darts, size M — Herzog §19.3
Profile upper torso 34″, full bust 38″, average tightness:
- dart = 38 − 34 − 1.5 = **2.50″**; per half = round(2.5 × 4.5 ÷ 2) =
  round(5.625) = **6 sts**.
- Σ-preserving pair (+6/side incs, −6/side neck decs) → body endsAt stays
  **172**; finished 38 − full 38 = 0 ease → no §19.5 compensation step.
- Gate passes (drift 0.11″, all Σ exact).

## Case F5 — sleeve length +2″, size M — KB §16.2 re-rate
- available = round(108 + 2 × 6) = **120 rows**; length 18″ → **20″**.
- taper 58 → 40 = 9 dec rounds over 120 rows (§7 split): q = 13, r = 3 →
  **every 13 rounds ×6 + every 14 ×3** (Σ rows 120, Σ decs 9 — decs never dropped).
- Schedule written AT SIZE M ONLY; S/L/XL keep 7×8 / 6×13 / 6×13 →
  `validatePattern(modified)` = [] (full multi-size Σ + spans clean).
- Σ: 54−16=38 · 58−18=40 · 68−26=42 · 72−26=46. **Gate PASSES.**

## Case F6 — sleeve shortened 2″, size M — taper COMPRESSES (§16.2)
- available = round(108 − 12) = **96 rows**; length → **16″**.
- §7 split of 9 decs over 96: q = 10, r = 6 → **every 10 ×3 + every 11 ×6**
  (Σ rows 96, Σ decs 9 — same dec count, tighter cadence).
- Multi-size Σ and spans clean (`validatePattern` = []).

## Engine gap found here and FIXED (2026-08-24, queue item 1)
`applySleeveLength` used to replicate the re-rated split to every size
(splitField), silently breaking the unmodified sizes' Σ — invisible to the
validation gate (it checks only the requested size) but caught by
`validatePattern`. Now writes per-size and updates the modified size's
rows/in so the schedule fits the span (validatePattern rule 3).

## Remaining engine gap (not fixed here)
- Dart events carry perSideSts length 1 vs sizeCount (known from flax-like).
