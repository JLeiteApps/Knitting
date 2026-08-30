# Golden expectations — Keith Moon (Kate Davies, *Yokes*, 2014) — hand-derived

Source: `extracted/yokes_extracted.md` (clean publisher text layer; PDF page = printed + 2).
Pattern pages: PDF 57–61 (printed 55–59). IR subset: sizes **1 / 4 / 7 / 10** of 10.
Acceptance test: `app/packages/engine/test/golden.keithmoon.test.ts`.
Third MVP construction family: **bottom-up circular yoke** (KB §21.1), the "single-round
shaping" style (§21.2). All numbers below derived by hand from KB formulas / the pattern
text, cited per line. (A notation-layer F0-style case is skipped on purpose: the extracted
text layer carries digit-spacing artifacts like "1 6" for 16 — publisher PDF quirks, not
OCR — so notation tests here would test text cleanup, not the parser.)

## Pattern facts (verbatim from the text)
- **Gauge (PDF p.58)**: "18 sts and 24 rounds to 10cm / 4in over stockinette worked in the
  round on 4.5mm needles" → **4.5 sts/in, 6 rounds/in**; "Row gauge is important."
- **Bust (p.57)**: 32 (…, 37¾ @4, 43½ @7, 49¾ @10)" finished. Neck (p.57): 24 / 24 / 25 / 26¾".
  Yoke depth (p.57): 8¼ / 9½ / 10¾ / 11¾". Body to underarm 17 / 18 / 19 / 19".
- **CO (p.58)**: 164 (190, 216, 240) sts, provisional + folded hem facing at the same count.
- **Waist shaping (p.58)**: 4 sts dec/round ("4 sts dec"), step A + 5 knit rounds,
  "Rep steps A and B a further 8 (…, 8, …, 7) times" → **9 / 9 / 9 / 8** dec rounds → 36 / 36 /
  36 / 32 dec → 128 (154, 180, 208)... text: 128 (134, 144, 154, 162, 170, 180, 188, 196, 208)
  → subset **128 / 154 / 180 / 208**. Σ: 164−36=128 ✓ 190−36=154 ✓ 216−36=180 ✓ 240−32=208 ✓
- **Bust shaping (p.59)**: 4 sts inc/round × 4 rounds = +16 → text: 144 (150, 160, 170, 178,
  186, 196, 204, 212, 224) → subset **144 / 170 / 196 / 224**. Σ: 128+16=144 ✓ etc.
  **Chest checkpoint check**: 144/4.5 = 32.0" ✓ 170/4.5 = 37.78" (table 37¾) ✓
  196/4.5 = 43.56" (43½) ✓ 224/4.5 = 49.78" (49¾) ✓ — the post-bust count IS the finished bust.
- **Underarm hold (p.59)**: "slip 3 (3, 4, 4, 4, 5, 6, 6, 6, 6) sts from each side of each
  marker" — 2 markers × 2 sides × N = 4N total → **12 / 16 / 24 / 24** held;
  body remains 132 (154, 172, 200). Σ: 144−12 ✓ 170−16 ✓ 196−24 ✓ 224−24 ✓
- **Sleeve (p.59)**: CO 48 (50, 56, 60); cuff decs "2 sts dec" × 2 → −4; inc taper
  "Rep steps C and D a further 5 (6, 7, 9, 8, 9, 10, 12, 10, 10) times then rep step C only
  once more" → (N+2) inc rounds × 2 sts = **+14 / +22 / +28 / +24** → 58 (68, 76, 80) ✓;
  hold 2×N = **6 / 8 / 12 / 12** → **52 / 60 / 68 / 68** remain.
  Upper-arm check: 58/4.5 = 12.89" (table 32.5 cm = 12.8") ✓ 76/4.5 = 16.89 (43 cm) ✓.
- **Join (p.59)**: 236 (274, 300, 336) = body 132 (154, 172, 200) + 2×sleeve 52 (60, 68, 68) ✓.
  Then 15 (18, 20, 20) plain CC2 rounds.
- **Yoke dec rounds (pp.60-61)** — the "single-round shaping" style (§21.2), 3 rounds:
  - round 1: 48 (56, 68, 78) dec → 188 (218, 232, 258)
  - round 2: 38 (44, 50, 58) dec → 150 (174, 182, 200)
  - round 3: 42 (66, 70, 80) dec → **108 (108, 112, 120)**
  Σ: 236−48−38−42=108 ✓ 274−56−44−66=108 ✓ 300−68−50−70=112 ✓ 336−78−58−80=120 ✓
  Neck check: 108/4.5 = 24.0" (table 24) ✓ 112/4.5 = 24.9 (63.5 cm = 25) ✓
  120/4.5 = 26.67 (67.5 cm = 26¾) ✓.
- Plain rounds between decs: MC 8 (8, 10, 10) then CC1 10 (14, 15, 20).

## Case KM1 — IR is Σ-clean (transcription ground truth)
`validatePattern(keithMoonGolden())` = **[]** — every section start + Σevents = end at all
4 sizes; schedule spans ≤ section rows (body_lower 54+4+24 ≤ 82; yoke 16+9+11 = 36 ≤ 50 etc.).

## Case KM2 — body length +2" (size 4, index 1) — KB §11 hem rule / §17.2
- Plain-span section (`body`): 4.33" → **6.33"**; rows 26 → round(6.33×6) = **38**.
- No shaping re-derived (the change lands in the plain tube above bust shaping —
  exactly the §11 "outside shaped sections" placement for a bottom-up body).
- Σ untouched: body 170 + 0 − 16 = 154 stays; chest recompute 170/4.5 = 37.78 vs 18.88×2 →
  drift 0.01 < 0.25. **Gate PASSES.**

## Case KM3 — gauge conversion 4.5→5 sts/in (size 4) → §6 BLOCK (real data)
Per-count conversion ×5/4.5: body_lower start 190→211 (211.1); waist dec perSide 2→2 ×9
(−36); bust inc perSide 2→2 ×4 (+16); end 170→189 (188.9). Residue = 211 −36 +16 −189 =
**+2**, not divisible by the balancer step (2×2=4) → **THROWS** the §6 diagnostic —
parity/count-rounding makes this conversion honestly impossible. (Mirrors Flax F3 and
flat-setin FS2: real data blocks, and the BLOCK is the expected output.)

## Case KM4 — bust vertical darts (size 4; upperTorso 34, fullBust 38, average) — Herzog §19.3
- Dart = 38 − 34 − 1.5 = **2.50"**; perSide = round(2.5 × 4.5 / 2) = **6 sts/half**.
- Events carry full per-size arrays; validatePattern clean at all sizes after the mod
  (F4b discipline). **Gate PASSES.**

## Case KM5 — sleeve length −2" (size 4) — §16.2 re-rate, bottom-up inc taper
- Length 14.25" → **12.25"**; rows 86 → round(12.25×6) = **74**.
- Taper COMPRESSES, incs never dropped: 11 inc rounds re-spaced over the available taper
  span (74 − 8 cuff-dec rounds − 1 hold round = **65 rows**); N/N+1 split (KB §7) →
  **every 5 rounds ×1 + every 6 rounds ×10** (Σ rows 65, Σ incs 11 — count unchanged
  → Σ preserved). (First draft of this expectation guessed every-6×11 over 66; the
  engine reserves the hold round too — verified correct and pinned here.)
- **Gate PASSES.**

## Case KM6 — size/ease (upperTorso 34, ease +2) — Herzog §19.1
- Target 34 + 2 = 36" → nearest finished bust of [32, 37.75, 43.5, 49.75] = **size 4**.
- The sheet reports the RECOMPUTED bust (chest sts ÷ gauge): 170 ÷ 4.5 = 37.78" → real
  ease at torso printed as **3.76"**; with fullBust 38 the advisory step flags bust ease
  −0.24" → "bust accommodation advised" (links intent 2.2, KB §11).

## Fixture note
Section `body_lower`/`body` split is faithful, not cosmetic: the pattern prints an explicit
checkpoint at bust-shaping end, and that count IS the finished bust — the schema gate
recomputes width_at_chest from a section's startsWith, so the chest checkpoint must start
the plain tube. Underarm holds are modeled as bind_off events (identical count effect;
src notes say "held on waste yarn").
