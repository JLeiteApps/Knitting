# SPEC — Intent Grammar (v0.1)

> Phase 4 deliverable 3 of 5. Natural-language request → machine-readable `ModificationRequest`
> the engine executes. Grounded in KB §11 (intent table), §19 (Herzog fit), §17 (policies),
> §16.2 (sleeve re-rate). The LLM classifies intent + fills slots; **the engine computes**.
> The original MVP contains 5 intents. The executable enum now also contains four
> explicitly gated extension intents; capability status is recorded in the engine
> matrix and unsupported geometry remains blocked.

## 1. Request schema

```ts
type Intent =
  | 'size_ease_selection'      // MVP 1
  | 'bust_accommodation'       // MVP 2
  | 'body_length_change'       // MVP 3
  | 'sleeve_length_change'     // MVP 4
  | 'gauge_conversion';        // MVP 5
  | 'waist_shape_reposition';
  | 'hip_width_change';
  | 'upper_arm_width_change';
  | 'back_neck_raise';

interface ModificationRequest {
  intent: Intent;
  patternId: string;
  /** Optional: run against a different size than the user's default. */
  sizeIndex?: number;
  /** Profile supplying body measurements (spec: shared/fit-profile). */
  profileId?: string;
  params: SizeEaseParams | BustParams | BodyLengthParams | SleeveLengthParams | GaugeParams |
    WaistRepositionParams | HipWidthParams | UpperArmWidthParams | BackNeckRaiseParams;
  /** Free-text original request, kept for the confirmation card. */
  raw: string;
}
```

Extension parameters are deliberately explicit: waist reposition requires both
`deltaIn` and a hem-to-waist landmark; hip width requires a requested width
checkpoint; upper-arm width requires a validated sleeve/armhole coupling; and
back-neck raise requires stitch-position short-row geometry. The current engine
blocks each route when those contracts are absent, rather than emitting a
Σ-balanced but physically unverified sheet.

## 2. MVP intent parameter schemas → engine functions

### 2.1 `size_ease_selection` (KB §19.1, §2)
```ts
interface SizeEaseParams {
  basis: 'upper_torso' | 'bust';         // default upper_torso [Herzog]
  targetEaseIn?: number;                  // or tier:
  tier?: 'fitted' | 'average' | 'oversized' | 'very_close' | 'close' | 'classic' | 'loose' | 'oversized_bust';
}
```
Engine: `recommendSizeByUpperTorso(profile.upperTorso, ease, sizes.finishedBust)` → size + real
ease. Output: chosen size, ease at torso AND at bust, whether bust accommodation is now advised
(bust ease negative or < tier min → link intent 2.2).

### 2.2 `bust_accommodation` (KB §19.2–19.4)
```ts
interface BustParams {
  method: 'auto' | 'vertical_darts' | 'short_rows';
  tightness?: 'tight' | 'average' | 'loose';   // default average
}
```
Engine chooser (auto): stitch pattern allows inc/dec → vertical darts; allover lace/cable →
short rows; >2" or very short waist → multiple vertical darts; both only in rare cases.
- Vertical: `verticalDart(fullBust, upperTorso, tightness, stsPerIn)` → width + per-side sts,
  removal at neck edge; worked example cadence: compress existing bust incs (e.g. every 8 → every
  4 rows), surplus removed via extra neck decs [Herzog §19.3].
- Short rows: `shortRowDartAmount(frontHemToShoulder, backHemToShoulder, tightness, rowsPerIn)`
  → rows/pairs; `shortRowPlacement(hemToArmhole)` → start/finish bounds + span rules [§19.4].
- Always applies `negativeEaseLengthCompensation(bustNegativeEase)` when final bust ease < 0.
Profile slots required: fullBust, upperTorso, (short rows: front/back hem-to-shoulder),
(front+back mid-hip widths if belly variant). Missing slots → questions (§3).

### 2.3 `body_length_change` (KB §11 hem rule + §17.2)
```ts
interface BodyLengthParams { deltaIn: number; }   // + longer, − shorter
```
Engine rules: length changes go OUTSIDE shaped sections (add/omit plain rows in the hem region:
top-down after waist shaping before ribbing; bottom-up before waist shaping begins). Output
preference is work-to-length ("work until piece measures X") [§17.2 EZ route]; row-exact variant
recomputes rows and re-derives nothing (plain span). Yardage note re-estimated (§13.2).

### 2.4 `sleeve_length_change` (KB §16.2 re-rate)
```ts
interface SleeveLengthParams { deltaIn: number; }
```
Engine: new available rows = `rowsPerIn × (oldLength ± delta)` minus ≥1" even span at top and
cuff rows; taper re-derived via `taperSchedule(upperArmSts, cuffSts, availableRows)` with Σ
verification; SHORTENING compresses the taper (more frequent dec rounds), never drops decs.

### 2.5 `gauge_conversion` (KB §2/§6, corrected formula)
```ts
interface GaugeParams { userStsPerIn: number; userRowsPerIn?: number; }
```
Engine: `convertCount(count, patternGauge, userGauge)` on every count + repeat-multiple
adjustment (`roundToRepeat`) + drift report per dimension (`driftIn`); rows via `convertRows`
when row gauge known, else §17.2 work-to-length. [Direction: new = old × new/old — see KB §2
erratum; the engine tests enforce it.]

## 3. Slot-filling dialog (before any compute)

| Intent | Required slots | Question when missing |
|---|---|---|
| size_ease_selection | upper torso (or bust) measurement; ease/tier | "How much ease do you like — fitted, average, or oversized?" |
| bust_accommodation | full bust + upper torso; short rows also front/back hem-to-shoulder; tightness | "Measure front and back hem-to-shoulder over the fullest bust — what's the difference?" |
| body/sleeve length | delta inches | "How much longer/shorter, in inches or cm?" |
| gauge_conversion | user sts/in (rows optional) | "What's your swatch gauge?" |

Cup-size phrasing ("make this bigger for a D cup") WITHOUT measurements → offer the measurement
path first [Herzog]. A bra size alone is not converted into body inches: generic cup/band
equivalence is unsupported and the request stays blocked until the required measurements are
provided (KB §10.1 legacy note is retained as historical context only).

## 4. Bounded extension intents and capability status

`waist_shape_reposition`, `hip_width_change`, `upper_arm_width_change`, and
`back_neck_raise` are now deterministic grammar intents with editable cards and
code-side gates. Their construction × measurement × provenance × validator
matrix is exported as `CAPABILITY_MATRIX` from `@knitting/engine`.

- `waist_shape_reposition`: **blocked** pending explicit plain spans before and
  after the hem-to-waist landmark.
- `hip_width_change`: **blocked** pending a requested hip-width checkpoint and
  repeat-aware span representation; repeated events cannot each receive the
  full requested delta.
- `upper_arm_width_change`: **blocked** pending armhole and sleeve coupling
  geometry; a construction label alone is insufficient.
- `back_neck_raise`: **blocked** pending complete stitch-position short-row
  turn points; inch placement fields are not stitch positions.

## 5. Remaining intent map (KB §11 full table)

`wider_frame_bust` (grade size at bust only) · `bigger_hip` · `bigger_upper_arm` ·
`waist_shape_reposition` · `back_neck_raise` (short rows) · `neckline_enlarge` ·
`sleeve_too_wide_rescue` (rib rework, B5-gated) · `gusset_rescue` · `length_reassignment`
(cut & reknit) · `pullover_to_cardigan` (steek route, §17.1 warnings) · `in_round_to_flat`
& `flat_to_in_round` (§17.1) · `yarn_substitution` (§13.2) · `ease_change` (re-run 2.1).

## 6. LLM contract (classifier) — IMPLEMENTED 2026-08-28

Input: raw text + pattern summary (construction type, sections, sizeCount). Output JSON:
`{ intent, params, missingSlots[], clarifyingQuestion? }`. Temperature 0; intent outside the
supported set for the pattern's construction → `unsupported` + explanation; NEVER compute
outputs, NEVER emit schedules — those are engine-only. Ambiguity between intents (e.g. "bigger"
→ frame vs cup) → ask the §11 disambiguation question (circumference vs cup volume).

Shipped as `/api/classify` (BYOK relay, `app/apps/api/classify.mjs`) + client pre-state gate
(`app/apps/web/src/classify.ts`): the LLM NEVER touches unit math or ranges — cm→in and
over-span→per-inch conversions happen in code, and invalid/absent numbers become NaN so the
deterministic slot gate asks instead of silently entering state (absent-not-trusted rule).
Schedules/counts stay OUT of the prompt (summary sanitizer).

### 6a. Deterministic implementation — DEFAULT PATH (2026-08-28, later)

`classifyDeterministic` (`app/apps/web/src/nlGrammar.ts`) implements this contract as pure
code — the LLM is now an OPTIONAL enhancer, never the default:
- **Confidence is explicit**: `exact` only when the intent is unambiguous AND every parameter
  came from the text (amount + longer/shorter direction, or a parseable gauge). Missing
  amounts, missing direction, cup-only phrasing, bare volume words ("bigger" — the §11
  frame-vs-cup question), or two changes in one request → `probable`/`unclear` with reasons.
- **The UI asks, never guesses silently**: non-exact drafts render the best-guess card plus
  the reasons and a "Let the LLM try" offer (BYOK key, per request); "Keep this draft"
  declines. Unit math (cm→in, over-N-sts→per-inch) happens in the grammar, in code.
- 15 unit tests (`nlGrammar.test.ts`) pin exact/probable/unclear routing. Body/sleeve
  length and gauge cards, as well as extension intents, require explicit numeric
  inputs and never receive fabricated defaults; blank required values block Run.
  Browser-verified
  end-to-end: deterministic draft → engine → validated sheet with no LLM anywhere.

## 7. Confirmation card ("show the math")

For every request before execution: parameters resolved (with profile source), the engine
functions that will run, the KB sections backing them (§ refs), and any warnings (unverified
factors, negative ease, irreversible steps). After execution: diff sheet + validation report
per spec 1 §5 and the app plan.
