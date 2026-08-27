# SPEC — Engine Functions (v0.1)

> Phase 4 deliverable 4 of 5. Codifies the IMPLEMENTED engine (`app/packages/engine`,
> suite 119/119) so spec and code stay one artifact. KB refs are the grounding; the
> golden cases in `tests/golden/**` are the acceptance contracts.

## 0. Principles
- Pure TypeScript, no I/O. Same inputs → same outputs.
- **LLM parses, code computes** (app plan §2): every number below is deterministic.
- Canonical unit: inches (policy A2). cm exists only at boundaries (§7).
- Two-tier rounding (A5): absolute counts round to nearest st (then repeat-multiple
  upstream); shaping Σ must land EXACTLY — failures block, never re-round.

## 1. Gauge math (`gauge.ts`) — KB §2/§6/§17.2
| Function | Contract | Grounding |
|---|---|---|
| `convertCount(old, from, to)` | `new = old × to/from`, per-count rounding (§3 tier-1) | KB §2 erratum (golden: 178→198 @4.5→5) |
| `convertRows(rows, from, to)` | same formula on row counts | KB §17.2 |
| `driftIn(old, new)` | abs difference | §13.8 |
| `rowGaugeDrift(lengthIn, from, to)` | length × (to−from)/from | §17.2 |
| `ROW_GAUGE_ACTION_THRESHOLD_IN` | **0.25″** — drift ≥ threshold ⇒ prefer work-to-length output | [policy] §17.2 |

## 2. Shaping distribution (`shaping.ts`) — KB §7/§9/§16.2
| Function | Contract |
|---|---|
| `evenIntervalSplit(events, span)` | Σ(rows) = span EXACTLY; Σ(times) = events; intervals differ by ≤1 (N/N+1 split). Throws when events > span. |
| `taperSchedule(upper, cuff, rows)` | dec rounds = (upper−cuff)/2 over rows; odd difference THROWS (checkpoint must move); carries Σ verification. |
| `sumRows/sumEvents` | Σ-check helpers used in step math lines. |

## 3. Fit (`ease.ts`, `darts.ts`) — KB §2/§10/§19
| Function | Contract | Grounding |
|---|---|---|
| `UPPER_TORSO_EASE_TIERS` | fitted/average/oversized min–max | Herzog §19.1 + VK tiers |
| `recommendSizeByUpperTorso(ut, ease, busts)` | nearest finished bust to ut+ease; reports real ease at torso | Herzog §19.1 |
| `verticalDart(fullBust, upperTorso, tightness, stsPerIn)` | dart = fb − ut − {1, 1.5, 2}″; perSide = round(dart × gauge ÷ 2) | Herzog §19.3 |
| `shortRowDartAmount(front, back, tightness, rowsPerIn)` | (front − back − {1,2,3}″) × rowsPerIn, floored to EVEN (pairs) | Herzog §19.4 |
| `shortRowPlacement(hemToArmhole)` | start at hemToArmhole − 2″; finish 1–2″ before armhole | Herzog §19.4 |
| `negativeEaseLengthCompensation(negEase)` | negEase × ⅔ (Herzog §19.5; Shroyer says ½ — C10 OPEN, Herzog implemented) |
| `frontBellyWidth(frontMidHip, backMidHip)` | max(0, front − back − 1″) | Herzog §19.3 |

## 4. Units (`units.ts`) — policy A2, three boundaries
`fmtLen(inches, unit, {digits})`: inch mode byte-compatible with legacy strings
(`round2(x)+'"'`, `digits:2` for the former toFixed sites); cm mode exact ×2.54 at
1 dp. Conversion boundaries: pattern import (dropdown-declared), user input, output
generation — never string post-processing.

## 5. Intent applier (`apply.ts`) — intent_grammar §2
`applyIntent(pattern, request, profile, {unit?})` → `{sheet, validation, modified}`.
Unit defaults to `profile.displayUnit`. All human strings generated via `fmtLen`.

| Intent | Route | Family behavior |
|---|---|---|
| size_ease | recommend + bust-ease advisory | — |
| bust | vertical darts OR short rows (auto: texture); §19.5 compensation when final ease < 0 | events carry FULL per-size arrays |
| body_length | plain-span work-to-length | **tube** (`body`/`body_tube`) OR **flat pair** (back+front each) |
| sleeve_length | top-down taper: `taperSchedule` re-rate at the modified size only. **Bottom-up cap sleeve** (inc+cap events): taper incs re-spaced over (rows − cap span), cap NEVER re-rated; inc count unchanged ⇒ Σ preserved | §16.2 |
| gauge_conversion | convertCount on every count + per-count `perSideSts`, then **§6 rebalance** per size; row conversion only when user row gauge given, else §17.2 work-to-length | §2 erratum |

**§6 rebalancer** (`rebalanceSection`): residue = start + Σevents − end; absorbed by the
first matching inc/dec event's `times` (step = 2 × perSide); odd residue or no balancer ⇒
THROWS (checkpoint must be nudged 1 st — golden Flax F3 / flat-setin FS2 pin the messages).
Parity note: an odd CO forces odd ends — some conversions are parity-unavoidably blocked.

**Per-size write rule** (Flax golden regression): modified-size values are written at
their index only (`perSize`); never replicate one size's schedule to others.

## 6. Validation gate (`validateAgainstSchematic`) — §13.8, spec 5
Runs on the MODIFIED pattern at the requested size: schematic recompute
(`width_at_chest` = startsWith/gauge; tube pieces halved for back/front dims) with
drift < 0.25″ per dimension, and per-section Σ (`start + Σevents = end`, both-sides
event deltas). `pass` = every check green; the UI withholds steps on failure.
Full multi-size Σ + schedule-span checks live in `validatePattern` (schema) — the
two-tier discipline: gate blocks the sheet; schema validation reports the IR.

## 7. Known gaps
- Grading (new sizes) blocked on A4/G2 (grade-by-chart is the policy).
- Gauge-conversion parity blocks (§5 note) are honest diagnostics, not bugs.
- C10 ease-length rule magnitude (Herzog ⅔ implemented, Shroyer ½ pending decision).
