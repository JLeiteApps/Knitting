# SPEC — Intent Grammar (v0.1)

> Phase 4 deliverable 3 of 5. Natural-language request → machine-readable `ModificationRequest`
> the engine executes. Grounded in KB §11 (intent table), §19 (Herzog fit), §17 (policies),
> §16.2 (sleeve re-rate). The LLM classifies intent + fills slots; **the engine computes**.
> MVP = 5 intents; the full §11 table maps in post-MVP (§4 below).

## 1. Request schema

```ts
type Intent =
  | 'size_ease_selection'      // MVP 1
  | 'bust_accommodation'       // MVP 2
  | 'body_length_change'       // MVP 3
  | 'sleeve_length_change'     // MVP 4
  | 'gauge_conversion';        // MVP 5

interface ModificationRequest {
  intent: Intent;
  patternId: string;
  /** Optional: run against a different size than the user's default. */
  sizeIndex?: number;
  /** Profile supplying body measurements (spec: shared/fit-profile). */
  profileId?: string;
  params: SizeEaseParams | BustParams | BodyLengthParams | SleeveLengthParams | GaugeParams;
  /** Free-text original request, kept for the confirmation card. */
  raw: string;
}
```

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
path first [Herzog]; if the user has only a bra size, fall back to the [conv] 1"-per-cup
estimate, clearly labeled unverified (KB §10.1 legacy note).

## 4. Post-MVP intent map (KB §11 full table)

`wider_frame_bust` (grade size at bust only) · `bigger_hip` · `bigger_upper_arm` ·
`waist_shape_reposition` · `back_neck_raise` (short rows) · `neckline_enlarge` ·
`sleeve_too_wide_rescue` (rib rework, B5-gated) · `gusset_rescue` · `length_reassignment`
(cut & reknit) · `pullover_to_cardigan` (steek route, §17.1 warnings) · `in_round_to_flat`
& `flat_to_in_round` (§17.1) · `yarn_substitution` (§13.2) · `ease_change` (re-run 2.1).

## 5. LLM contract (classifier)

Input: raw text + pattern summary (construction type, sections, sizeCount). Output JSON:
`{ intent, params, missingSlots[], clarifyingQuestion? }`. Temperature 0; intent outside the
supported set for the pattern's construction → `unsupported` + explanation; NEVER compute
outputs, NEVER emit schedules — those are engine-only. Ambiguity between intents (e.g. "bigger"
→ frame vs cup) → ask the §11 disambiguation question (circumference vs cup volume).

## 6. Confirmation card ("show the math")

For every request before execution: parameters resolved (with profile source), the engine
functions that will run, the KB sections backing them (§ refs), and any warnings (unverified
factors, negative ease, irreversible steps). After execution: diff sheet + validation report
per spec 1 §5 and the app plan.
