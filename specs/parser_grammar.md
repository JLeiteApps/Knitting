# SPEC — Parser Grammar & Pipeline (v0.1)

> Phase 4 deliverable 2 of 5. How a pattern PDF becomes a validated Pattern JSON (spec 1,
> `app/packages/schema`). Grounded in KB §12 (notation), §13.9d (publisher conventions),
> §13.8 (schematic), A1/A3 (open lexicon items accommodated, not guessed).
> Principle: **the LLM extracts, it never computes** — every count is copied verbatim with
> evidence; every derived number is produced by deterministic post-processing or the engine.

## 1. Pipeline stages

```
PDF ─▶ [1] extract ─▶ [2] segment ─▶ [3] LLM extract ─▶ [4] normalize ─▶ [5] validate ─▶ [6] review UI
        (pdf.js,            (heading +        (structured          (gauge → /in,        (schema +
         text-layer          construction      JSON, chunked,       size arrays,          Σ checks)
         detect)             keywords)         evidence reqd)       checkpoints)
```

1. **Extract** — client-side pdf.js page text. If a page has <20 chars of text → scanned page;
   >30% scanned pages → whole pattern flagged `needs_ocr` (MVP: user pastes text or processes
   the PDF on desktop; browser OCR is post-MVP).
2. **Segment** — deterministic split into the KB §12 document blocks: title/construction note →
   sizing → schematic captions → yarn/needles/notions → gauge → instructions (per piece/section)
   → finishing. Headers matched by keyword lists (`SIZES`, `TO FIT`, `GAUGE`, `NEEDLES`,
   `FINISHING`, `ABBREVIATIONS`…). Segments carry page numbers for provenance.
3. **Optional LLM extract** — only after the user presses the assist button. A
   stored key does not send source text automatically. Changing source invalidates
   prior outcomes and ignores stale responses (contract §3).
4. **Normalize** — deterministic: gauge → sts/rows per inch; cm → inches (2.54); fractions
   ("½") → floats; size arrays aligned to `sizeCount`; stitch-checkpoint rows captured as
   `sts_note` events. No rounding beyond float conversion.
5. **Validate** — `validatePattern()` from `@knitting/schema`: array lengths, Σ reconciliation,
   schedule-vs-span, gauge normalization. Errors block; warnings annotate.
6. **Review UI** — every field shows confidence + its evidence quote; user corrections re-run
   stage 5 live. Parse is only "accepted" when validation is clean.

## 2. Notation grammar (deterministic, pre-LLM)

Applied by regex/tokenizer before any model call — these rules are reliable enough to hard-code
(KB §12, §13.9d):

- **Multi-size lists**: `66 (72, 78, 84) sts` → first size OUTSIDE parens, rest inside,
  ascending. SAME position everywhere (counts, lengths, repeats, yardage). Entry count must
  equal `sizeCount` from the sizing block; mismatches are validation errors, not guesses.
- **A1 disambiguation**: `( )` after a VERB context (`k2, m1`) = repeat group; `( )` containing
  only comma-separated numbers whose count == sizeCount = size alternatives; `[ ]` = repeat
  unit possibly with "N times"; nesting allowed: `k6, [k1, m1, (k2, m1) 3 times] to end`.
- **Units**: `4 (10) cm`, `110 yd [100 m]`; 1 yd = 0.914 m; cm→in via 2.54; fractions
  `½ ¼ ¾ ⅜…` and `7½` → floats.
- **Gauge statements**: `20 sts & 28 rows = 4" (10 cm) in St st` → gauge block; sts/4" most
  common, sts/in (Budd) and sts/10cm normalized to per-inch floats. First gauge listed =
  primary. Missing row gauge → `rowsPerIn: null`; request it or keep row-derived output
  advisory (§17.2 step 6), never estimate from stitch gauge.
- **To-fit vs finished (A3)**: detect from phrasing — `to fit bust/chest/head…` = to_fit;
  `finished chest/bust/circumference…` = finished; ambiguous → `unknown` (engine asks user).

## 3. LLM prompt contract

One call per segment. System rules (temperature 0, JSON-only output):

1. Output ONLY fields from the provided target schema subset (per segment: sizing-block schema,
   gauge-block schema, section schema…).
2. Every extracted number carries `evidence`: a VERBATIM substring from the input segment.
   Post-check in code: evidence must actually occur in the segment, else the field is dropped
   rather than entering app state. Numeric fields must also match their own
   count/span token and canonical unit; finding an unrelated number in a quote
   is insufficient. Fraction parsing is deterministic.
3. Copy counts exactly — never sum, average, convert, or "fix" numbers. Derived values
   (stsPerIn, totals) are computed downstream deterministically.
4. Unknown/absent → `null` with `confidence: 0`. Never invent sizes, gauges, or repeats.
5. `confidence` ∈ {high: explicit statement, medium: parsed from table/abbreviation context,
   low: inferred from position/format only}.

Per-segment extraction targets:

| Segment | Fields (IR paths) |
|---|---|
| Title block | `meta.name/designer/publisher/year` |
| Construction note | `construction.direction/type/pieces/working` — phrase lexicon: "worked in the round from the top down" → top_down + in_the_round; "worked flat in pieces, set-in sleeve" → flat_set_in; enum per schema |
| Sizing | `sizing.labels/sizeCount/measurementBasis/bustOrChestIn` |
| Schematic captions | `schematic[]` (piece, dimension, per-size inches, basis total/incremental) |
| Gauge | `gauge[]` blocks + `raw` |
| Materials | `materials` (informational) |
| Instructions | `sections[]`: id, piece, method, startsWith/endsAt, length, events with schedules, `src` page refs; running counts ("— 200 (216) sts") captured as checkpoints |
| Finishing | `finishing` (informational) |

## 4. Post-processing rules (deterministic)

- Sizes: array from every size-list occurrence must match sizeCount; misaligned occurrences →
  validation error listing the offending `src`.
- Checkpoints: emitted between events whenever printed; `validatePattern` reconciles
  `start + Σevents = end` per size (spec 1 §3.2).
- Rounding: NONE during parse. Counts stay verbatim; conversion/rounding happens only in the
  engine (tier-1 rounding per A5).

## 5. Failure modes & routing

| Failure | Signal | Route |
|---|---|---|
| Scanned PDF | <20 chars/page on >30% pages | `needs_ocr` flag → paste-text or desktop OCR path |
| Multi-column garble | segment text shuffled (line-order breaks) | LLM may still extract with evidence; else low confidence → manual field entry |
| Charts as images | schematic/colourwork pages with no text | schematic dims from caption text only; chart contents out of scope MVP |
| Abbreviation drift | unknown tokens in glossary check | map via CYC master list; unmapped → surface in review UI |
| OCR fraction garble (`4\*"`, `5cm`) | regex misses | LLM evidence pass; else manual |

## 6. Worked micro-example

Input segment (page 3): "CO 160 (176, 192) sts. Join in the round. Work even until piece
measures 13 (13, 14)". Output fragment:

```json
{
  "sections": [{
    "id": "body", "piece": "body", "method": "in_the_round",
    "startsWith": { "event": "cast_on", "sts": [160, 176, 192] },
    "length": { "in": [13, 13, 14] },
    "events": [], "src": "p.3"
  }]
}
```
(`sizeCount: 3` from the sizing block; arrays already aligned; evidence: "160 (176, 192) sts".)

## 7. Acceptance tests (golden set, plan Phase 5 QA)

For each golden pattern (TCK Flax & co.): hand-verified sizes list, gauge line, construction
type, section order, key checkpoints; parser output must match exactly or surface differences
as review items with correct evidence. Σ checks must pass on the hand-corrected version.

## 6. Current implementation boundary (reviewed 2026-09-05)
The broad pipeline above is staged; automatic instruction assembly is incomplete.
The current optional LLM UI requests sizing and gauge fields, not every target in
the broader table. Real Flax extraction succeeds in the browser but retains
unresolved section/schedule data as a draft. Hand-derived golden IR is separate.

`buildPatternDraft` is shared outside React. Unknown construction/working method
is explicit and gates acceptance. Review supports sizing, gauge, basis and
construction corrections; it is not yet a general section/checkpoint editor.
Saved drafts reopen from their existing IR without discarding sections when source
text is missing. Replacing source resets source-bound corrections and LLM fields.
No OCR is started by the import flow; scans require separate explicit authorization.
As of 2026-09-05, Add pattern requires the user to select Sweater before PDF/paste
processing and writes that identity outside parser internals. The parser still
infers construction independently; it does not infer garment identity from titles
or source prose.
