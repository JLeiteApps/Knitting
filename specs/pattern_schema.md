# SPEC — Pattern JSON Schema (v0.1)

> Phase 4 deliverable 1 of 5. Defines the intermediate representation (IR) every parsed pattern
> becomes before the modification engine runs. Derived from KB §12 (parsing), §3/§4 (Budd chart
> system & construction sequences), §13.8 (schematic verification), §11 (what mods need),
> §13–§16 construction taxonomy. Formalism: JSON Schema draft 2020-12 concepts, described here
> in prose + example; a machine-readable `.schema.json` follows once field freezing is done.
>
> **Open dependencies (do not resolve by guessing)**: A2 canonical gauge unit (schema stores BOTH
> raw-as-printed and normalized-per-inch; engine reads normalized), A1 parentheses rule (parser
> concern — schema just carries parsed arrays), A3 to-fit/finished lexicon (enum field, parser fills).
> Not blocked by A4 (grading) — grading is engine-side, not IR-side.

## 1. Design rules

1. **LLM parses, code computes.** The IR stores *counts and schedules*, never prose. Every number
   the engine later does arithmetic on is a typed field, not embedded text.
2. **Σ-verifiability is structural.** Every section carries stitch-count checkpoints; every shaping
   event carries its per-side stitch delta and row span. Validators recompute
   `Σ(events) = checkpoint delta` and `Σ(interval × times) = span` (KB §7, rule 1) without an LLM.
3. **Per-size arrays everywhere.** Convention from KB §12: size i is the same array position in
   every count, length, and schedule. Array length MUST equal `sizing.size_count` everywhere.
4. **Provenance on every number.** Each numeric array may carry `src` (page/line ref into the
   source PDF). Required for the modification sheet (D1: diff-style output references the user's
   own pattern — no reproduced prose).
5. **Inches canonical internally** [policy]: all lengths normalized to inches (float) at parse
   time; raw as-printed strings preserved in `raw`. cm display is a rendering concern.
6. **Round vs flat is per-section, not per-garment** (KB §13.7, §16.1: tops routinely mix rows
   above underarm and rounds below).

## 2. Top-level object

```
Pattern
├── schema_version            "0.1"
├── meta                      name, designer, publisher, year?, pdf_ref, copyright_note,
│                             parse_date, parser_confidence
├── sizing                    size system (§2.1)
├── gauge                     one or more gauge blocks (§2.2)
├── materials                 yarn[], needles[], notions[]   (informational)
├── stitch_patterns           named defs referenced by sections (§2.5)
├── schematic                 per-size finished dimensions (§2.3)
├── construction              enum + direction + per-piece map (§2.4)
├── sections                  ordered instruction spine (§3)
└── finishing                 seam/pickup/blocking notes (informational)
```

## 2.1 `sizing`

```
{ "labels": ["6 mo", "12 mo", ..., "M (G)"],   // as printed
  "size_count": 5,
  "measurement_basis": "to_fit" | "finished" | "unknown",      // A3 lexicon, parser-filled
  "bust_or_chest_in": [17, 18, 20, ...],        // inches float, per size; the key width axis
  "notes": "..." }
```

`measurement_basis` drives the ease computation (KB §2): `finished` values may be used as finished measurements. A `to_fit` chart is
not converted into finished circumference without independent evidence; size
selection requires explicit finished dimensions. Unknown basis remains explicit.

## 2.2 `gauge`

Array — some patterns state one gauge per stitch pattern (KB §12: first listed is primary).

```
{ "primary": true,
  "stitch_pattern_ref": "stockinette",          // → stitch_patterns
  "worked": "flat" | "in_the_round" | "unknown",
  "sts_over": 20, "rows_over": 28, "over_in": 4.0,     // as printed
  "sts_per_in": 5.0, "rows_per_in": 7.0,              // normalized floats
  "rows_given": true,                                  // false → §17.2 step 6 fallback
  "raw": "20 sts & 28 rows = 4\" in St st" }
```

Missing row gauge is represented by null row-gauge fields. Row-derived output
is advisory or blocked until the gauge is supplied; no stitch-to-row ratio is inferred.

## 2.3 `schematic`

Per-size finished dimensions in inches — the validation target (KB §13.8: engine recomputes these
from counts ÷ gauge and checks drift after every modification). Named dimensions:

```
{ "piece": "back", "dimension": "width_at_chest", "in": [17.5, 19.5, ...], "src": "p.2 schematic" }
```

Dimension vocabulary: `width_at_chest`, `width_at_waist`, `width_at_hip`, `length_total`,
`length_to_underarm`, `armhole_depth`, `neck_width`, `neck_depth_front`, `shoulder_width`,
`cross_back`, `sleeve_length_underarm`, `sleeve_length_center_back_to_wrist`, `upper_arm_width`,
`cuff_width`, `cap_depth`. Cardigans additionally record `band_width` (KB §13.8:
cardigan bust = back + 2×front + band). Field `basis: "total"|"incremental"` per KB §13.8.

## 2.4 `construction`

```
{ "direction": "bottom_up" | "top_down",
  "working": [ {"scope": "sections:1-3", "method": "flat" | "in_the_round" | "unknown"} ],
  "type": <enum below>,
  "pieces": ["back","front","sleeve×2"] }
```

**`type` enum** (each maps to a KB algorithm module; mods dispatch on this):

| Value | KB § | Value | KB § |
|---|---|---|---|
| `flat_drop_shoulder` | §4, §13.7 | `top_down_raglan` | §13.5, §15.2, §16.1 |
| `flat_set_in` | §13.4, §13.9a | `top_down_yoke` | §14.2, §16.1 |
| `bottom_up_yoke` | §21 (Davies; added 2026-08-30 w/ the Keith Moon golden case) | | |
| `flat_raglan` | §13.5 | `top_down_set_in` | §15.3 |
| `flat_saddle` | §14.4 | `contiguous_simultaneous_set_in` | §15.4 |
| `steeked_cardigan` | §13.9b, §14.7, §16.2 | `top_down_saddle` | §15.5 |
| `eps_yoke` | §14.2 | `dolman_kimono` | §15.6 |
| `eps_raglan` | §14.3 | `square_set` | §15.7 |
| `eps_hybrid` | §14.5 | `top_down_drop_shoulder` | §15.8 |
| `kangaroo_cut_armhole` | §14.6 | `modified_drop_shoulder` | §16.1 |
| `accessory_hat` / `_sock` / `_mitten` / `_glove` / `_scarf` / `_tam` | §4, §14.8 | | |

Accessory types use the same section model (cuff → thumb gusset → hand → tip, etc.).

## 2.5 `stitch_patterns`

```
{ "id": "cable_panel", "name": "4-st cable (C2F/C2B)",
  "stitch_repeat": 8, "row_repeat": 12,
  "chart_ref": "p.4", "compensation": {"type": "add_sts_per_column", "sts": 1} }   // KB §16.2/§17.3
```

`stitch_repeat`/`row_repeat` feed repeat-multiple adjustments (KB §2, §15.10) and row-repeat-
aligned shaping re-derivation (§17.2 step 4). Width/row `factor` fields are reserved for the
§17.3 measured-factor table (absent → st-level compensation + warning).

## 3. `sections` — the instruction spine

Ordered array. A section is one construction stage of one piece (or of the joined tube after a
`divide`/`join` event). Minimum complete model:

```
{ "id": "body",
  "piece": "body",                       // back | front | left_front | sleeve | body_tube | ...
  "method": "in_the_round",
  "starts_with": {"event": "cast_on", "sts": [160, 176, 192, 208, 224]},
  "ends_at":   {"event": "bind_off", "sts": [...]}        // or {"event": "hold"} / {"event": "divide"}
  "length":    {"rows": [120, 122, ...]}  OR  {"in": [16.5, 17.0, ...]},   // as printed (one of)
  "stitch_pattern": [{"ref": "stockinette", "except_cols": [...]}],
  "events": [ <shaping events, chronological> ],
  "src": "pp.3-4" }
```

### 3.1 Shaping event model (the Σ-verifiable core)

```
{ "type": "inc" | "dec" | "bind_off" | "cast_on" | "short_row" | "place_marker"
          | "divide" | "join" | "steek_plan" | "pickup",
  "location": "each_end" | "each_side_of_marker:m3" | "raglan_line:FL" | "center" | "evenly",
  "per_side_sts": [2, 2, 2, 2, 2],            // stitch delta THIS event contributes per side
  "schedule": {
     "cadence": "every" | "alternating" | "at_once" | "work_to_length",
     "interval_rows": [6, 6, 8, 8, 8],         // per size; rows OR rounds per §section.method
     "times": [10, 10, 9, 9, 8],
     "variant_rows": [7, 7, 9, 9, 9] },        // N/N+1 interval split (KB §7); Σ rows must match
  "stitch_pattern_ref": "cable_panel",          // if the event interacts with a texture column
  "src": "p.3 ¶2" }
```

- `inc/dec`: `per_side_sts` × 2 sides × `times` must equal the checkpoint stitch delta
  between this section's neighbours — the validator recomputes this (rule 2).
- `bind_off/cast_on`: same math, single contribution.
- `short_row`: `{turn_points: [...], method: "wnt" | "german" | "given"}` — engine rewrites
  between methods per KB §10.3b; `gap_sts` recorded as printed (B8: 5–7, pattern-given).
- `divide` (top-down sleeve split, pocket, front split) and `join` (underarm join, round join):
  carry the resulting piece map; `working.method` may flip across them (§13.7, §16.1).
- `steek_plan`: `{sts: 10, reinforcement: "machine" | "crochet" | "none", cut: "center_front"}`
  — KB §13.9b/§17.1; engine output must carry the irreversibility warning.
- `pickup`: `{ratio_or_count, along: "armhole" | "steek_edge" | "neck"}` — KB §14.7 ratios.

### 3.2 Checkpoint rule

Between consecutive events the stitch count is EXACTLY the last checkpoint ± Σ applied events.
The parser emits a checkpoint (`sts_note`) whenever the pattern prints a running count
("— 200 (216, ...) sts". The validator fails on any mismatch — KB §3 knitgrader warning:
freehand arithmetic drifts; the schema exists to prevent it structurally.

## 4. Worked fragment (illustrative)

Top-down raglan body after sleeve divide (Flax-like), 5 sizes:

```json
{
  "id": "body", "piece": "body", "method": "in_the_round",
  "starts_with": {"event": "join", "sts": [172, 188, 204, 220, 236]},
  "length": {"rows": [130, 132, 134, 138, 140]},
  "stitch_pattern": [{"ref": "stockinette", "except_cols": [{"ref": "garter_streak", "cols": [2], "where": "each_side_of_marker:m1|m2"}]}],
  "events": [
    {"type": "dec", "location": "each_side_of_marker:m1", "per_side_sts": [1,1,1,1,1],
     "schedule": {"cadence": "alternating", "interval_rows": [8,8,8,8,8], "times": [4,4,4,4,4]},
     "src": "p.3"},
    {"type": "inc", "location": "each_side_of_marker:m2", "per_side_sts": [1,1,1,1,1],
     "schedule": {"cadence": "alternating", "interval_rows": [12,12,12,12,12], "times": [4,4,4,4,4]},
     "src": "p.3"}
  ],
  "ends_at": {"event": "bind_off", "sts": [172, 188, 204, 220, 236]},
  "src": "pp.3-4"
}
```

Validator: waist decs −8 and hip incs +8 → net 0 → end = start ✓; 4×8 rows of waist + 4×12 of hip
≤ 130 ✓ (plain rows implicit in the remainder).

## 5. Validation contract (what the parser MUST deliver before engine hand-off)

1. All per-size arrays have length `size_count`.
2. Every section: start/end checkpoints present; Σ events reconcile exactly (§3.2).
3. Every schedule: `interval_rows × times (+ variant split)` ≤ section length; Σ interval rows
   where a span is fully shaped = that span.
4. `schematic` present for at least `width_at_chest`, `length_total`, `armhole_depth` (sweaters)
   — else validation loop (KB §13.8, plan Phase 4 item 5) cannot run; engine degrades to
   advisory mode with a warning.
5. Seam-paired invariants where applicable: raglan cap rows = armhole rows; set-in cap curve
   length ≈ armhole curve (KB §13.9a, §17.1 step 2).
6. `construction.type` ∈ enum; every `stitch_pattern.ref` resolves.

## 6. Out of scope / next specs

- Parser grammar (KB §12 + A1 rule) — spec 2; will define how prose → this IR.
- Intent grammar (KB §11 → machine-readable) — spec 3.
- Modification-engine function specs (§2/§3/§7/§13/§17 math) — spec 4; grading function blocked
  on A4/G2.
- Validation-loop spec (recompute schematic vs target; drift < 0.25"/dimension) — spec 5.

## Runtime additions and limits (2026-08-30)
The TypeScript IR uses camelCase names; the examples above retain conceptual
snake_case notation. `meta.status` distinguishes draft/accepted. Construction type
and working method may be `unknown` in stored drafts, but not accepted patterns.

Runtime validation checks imported shapes, finite numeric values, size-array
alignment, valid method/event enums, gauge normalization and nonnegative integer
event schedules. Starting stitches are positive; end checkpoints may be zero for
fully closed sections. Only specific incompleteness diagnostics are allowed through
the draft-storage boundary; malformed nested values are rejected.

Unknown placeholder bust values are not finished measurements. Short-row turn
points are stitch positions, not inch measurements. Until complete placement
geometry is represented, those results cannot become verified. General bra-label
conversion and the four new extension geometries remain outside the implemented IR.
