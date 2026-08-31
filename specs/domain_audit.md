# Source-to-code domain audit

Audit date: 2026-08-31

Checkout: `codex/domain-knowledge-audit`, baseline `1c63701`

Scope: read-only source and production-code inventory, protection map, and correction candidates. The only production correction authorized in this batch is the transport logging change recorded as D-1 below.

The full `knitting_knowledge_base.md` was read before domain review. Original source review used the extracted Herzog passages at PDF pp. 33–34 and 353–354. Righetti PDF pp. 187–192 was reviewed for shaping-span context. C8/C9 print-reference checks were not performed; no OCR, benchmark, network service, or paid API was used. Source locators below identify KB sections separately from printed book pages. This is an inventory and risk review, not exhaustive source certification: supported principles and passing existing tests do not certify every caller, construction, source pattern, or numerical edge case.

## Production inventory

The audit covered all 45 runtime code modules.

Finding IDs below use a hyphen (for example, A-1) to distinguish them from the
unchanged manual-question IDs (A1). Reference-table review checked the existing
KB provenance and consumers; it did not freshly verify every table cell against
printed books or the current CYC website. Engine conversion direction, exact
unit factors, integer interval sums, and the average-fit short-row floor-to-even
rule have supporting KB/source anchors. That support does not settle the caller
and evidence defects listed below.

| Area | Production paths and role |
| --- | --- |
| Shared contract | `app/packages/shared/src/index.ts` — fit profile, intent/request, sheet, and validation-report types. |
| Schema | `app/packages/schema/src/index.ts` — Pattern IR; `app/packages/schema/src/validate.ts` — unknown-value boundary, gauge/section/schedule/Σ validation; `app/packages/schema/src/mod.ts` — package exports. |
| Engine | `app/packages/engine/src/apply.ts` — intent dispatcher, five MVP routes, bounded post-MVP routes, schematic/Σ evidence gate; `capability.ts` — capability registry; `gauge.ts` — count/row conversion, width, drift, threshold; `units.ts` — inches/cm conversion and formatting; `shaping.ts` — interval split and sleeve taper; `darts.ts` — vertical/short-row darts and negative-ease compensation; `ease.ts` — ease tiers and size recommendation; `data/cyc.ts` — CYC measurement tables; `fixtures/flaxLike.ts` — Σ-clean fixture; `index.ts` — exports. |
| Parser | `app/packages/parser/src/notation.ts` — numbers, brackets, gauge, basis, segmentation; `instructions.ts` — size lists, checkpoints, repeats, headers, section candidates; `sectionBuilder.ts` — candidates to sections; `draftBuilder.ts` — editable Pattern draft and construction inference; `llmExtract.ts` — extraction prompt and evidence gate; `index.ts` — exports. |
| API | `app/apps/api/extract.mjs` — capped BYOK extraction relay; `classify.mjs` — capped BYOK classification relay. Declarations `extract.d.mts` and `classify.d.mts` were also checked. |
| Web numerical/evidence boundary | `app/apps/web/src/api.ts` — extraction response shape and evidence gate; `classify.ts` — classifier shape/range/unit normalization; `nlGrammar.ts` — deterministic request grammar; `intents.ts` — slot gate and intent backing; `reviewInputs.ts` — manual size/gauge correction parsing; `units.ts` — display/input conversion. |
| Web workflow and screens | `app/apps/web/src/App.tsx`, `main.tsx`, `ConfirmButton.tsx`, `toast.tsx`, `styles.css`; screens `AddPattern.tsx`, `FitProfile.tsx`, `Library.tsx`, `NewModification.tsx`, `SheetScreen.tsx`. |
| Web persistence and recovery | `app/apps/web/src/store.ts`, `storage.ts`, `sessionDrafts.ts`, `backup.ts`, `vault.ts`. |
| PDF path | `app/apps/web/src/pdf.ts`, `pdf/extract.ts`, `pdf/worker.ts` — capped, confined PDF text extraction. |
| Supporting runtime | `app/apps/web/public/sw.js`, `app/apps/web/index.html`, manifest/icons, package/config/README files. These were checked for boundary behavior; they are not counted in the 45 code modules. |

## Protected question map

The following symbols and callers are coupled to protected questions. No changes to them are included in this batch.

| Question | Code symbols/callers | Protection disposition |
| --- | --- | --- |
| A1 — parentheses and bracket disambiguation | `parser/notation.ts:classifyBracket`, `parseSizeList`; `parser/instructions.ts:findSizeLists`, `parseRepeatStatement`, `extractSectionCandidates`; `parser/sectionBuilder.ts:align`, `padTrailing`, `resolveEndsAt`; `web/screens/AddPattern.tsx` analysis/build path. | Protect parser tokenization, alignment, warnings, and callers until commercial-PDF evidence is answered. |
| A3 — to-fit versus finished | `notation.ts:detectMeasurementBasis`; `draftBuilder.ts:buildPatternDraft`, `inferConstruction`; `schema/validate.ts` measurement-basis check; `AddPattern.tsx` basis review and acceptance gate; `FitProfile.tsx` direct measurements. | Protect basis inference, schematic derivation, and acceptance behavior. |
| A4/G2 — differential versus linear grading | `engine/data/cyc.ts:CYC_*`, `CYC_TABLES`; `engine/ease.ts:recommendSizeByUpperTorso`; `engine/apply.ts:applySizeEase`; `web/intents.ts`, `nlGrammar.ts`, `NewModification.tsx`. There is no new-size grading route in the current engine. | Protect tables, constants, and future grading seams until the formal user decision lands. |
| A6 — raglan body-versus-sleeve increase math | `schema/validate.ts:stitchDelta`; `engine/apply.ts:applyGaugeConversion`, `rebalanceSection`, `evDelta`, `validateAgainstSchematic`; parser section events; `engine/fixtures/flaxLike.ts` and golden consumers. | Protect event formulas, rebalancing, fixture expectations, and output wording. |
| B4 — missing row gauge | `notation.ts:parseGaugeStatement`; schema `checkGauge`; `engine/gauge.ts:convertRows`, `rowGaugeDrift`; `apply.ts:applyGaugeConversion`, body/sleeve length checks; `capability.ts`; web review and request gauge forms. | No stockinette ratio is introduced. Protect null/advisory/blocked behavior. |
| B5/G5 — stitch-pattern width factors | schema stitch-pattern fields and event refs; `sectionBuilder.ts` event mapping; `apply.ts:applyBust` textured-method selection; LLM extraction fields. | No percentage factor is in production. Protect the pending swatch protocol and uncertainty behavior. |
| B6 — ease defaults | `engine/ease.ts` tier tables; `apply.ts:TIER_EASE`, `BUST_TIER_EASE`, `applySizeEase`; `nlGrammar.ts` tier parser; `NewModification.tsx` ease controls. | Protect numeric constants and fit output until the remaining sock rule is answered. |
| B7 — neck opening/head clearance | `apply.ts:applyBackNeckRaise`; `capability.ts` back-neck gate; `schema` short-row fields; `intents.ts:missingSlots`; `nlGrammar.ts`; `NewModification.tsx`. | Protect neck and short-row gates and warnings. |
| B8 — German short-row turn gap | `instructions.ts` and `sectionBuilder.ts` (no deterministic turn-gap parser); `apply.ts:applyBust` short-row event; `validateAgainstSchematic` empty-turn-point advisory; `NewModification.tsx`. | Keep turn-point and method behavior report-only pending the answer. |
| C5 — CYC yarn-weight boundaries | No yarn-weight table is present in production; `engine/data/cyc.ts` contains measurements only. Any future yarn table would be a new data boundary. | No correction proposed; protect reference-data addition until PDF check. |
| C8/C9 — EZ and Walker/Budd-TD OCR-suspect figures | No direct C8/C9 constants are integrated in production. Generic routes are `engine/apply.ts`, `shaping.ts`, and capability declarations. | No source-derived code is added; print checks remain open. |
| C10 — negative-ease length slope | `engine/darts.ts:negativeEaseLengthCompensation`; `apply.ts:applyBust`; `intents.ts` backing; `NewModification.tsx` bust route; `specs/intent_grammar.md` and `engine_functions.md` references. | Protect the implemented Herzog ⅔ constant and output until the Shroyer ½ versus Herzog ⅔ decision. |
| D2/G1 — measurement UX and bra-label conversion | `shared/src/index.ts:FitProfile`; `FitProfile.tsx`; `AddPattern.tsx` basis/sizing review; `intents.ts:missingSlots`; `nlGrammar.ts` cup-only warning; `classify.ts` normalization; `NewModification.tsx`. | Direct measurements stay supported. No bra-label conversion or fallback is enabled. |
| D3 — product scope | `schema/index.ts` construction and event enums; `engine/capability.ts`; `apply.ts` blocked routes; `NewModification.tsx` capability display; `AddPattern.tsx` construction selector. | Protect all blocked/deferred capability rows and construction options pending scope decision. |

## Findings and dispositions

### A — units and gauge

| ID | Classification and evidence | Source/provenance | Disposition |
| --- | --- | --- | --- |
| A-1 | **Confirmed reproduction.** `parser/notation.ts:95–102` handles `20 sts / 10 cm` by computing `stsPerIn = 5.08`, then synthesizing `stsOver = 20`, `overIn = 4`. The implied value is 5, so `schema/validate.ts:154–161` emits `GAUGE_NORMALIZATION_MISMATCH`. The same inconsistent precision can block an otherwise valid gauge-conversion input at the engine boundary. | KB §2; `specs/parser_grammar.md` gauge normalization; A2 is already resolved: inches are canonical and conversion is specified exactly once at the boundary. | **Deferred/protected.** Parent reproduced this in memory. Deferral is because the repair touches protected downstream gauge/validation callers and related B4/A6/D2 behavior; it is not a new canonical-unit decision. Do not change parser, schema, engine, tests, or output in this report batch. |
| A-2 | **Static candidate.** `web/src/units.ts:12–15` and `reviewInputs.ts:34` round canonical inches to two decimals during input conversion, while `engine/units.ts:1–4` documents rounding at display time. Manual gauge over/span normalization in `reviewInputs.ts` retains full precision; `classify.ts` rounds classifier over-span values to two decimals. | A2; `specs/pattern_schema.md` and `specs/validation_loop.md`. | **Deferred/protected.** A2 is resolved and exact conversion is specified. Review remains report-only because these shared helpers touch protected B4/A6/D2 callers and numerical gates. |
| A-3 | **Confirmed reproduction.** Parent ran a one-size flat pattern with back start/end 100 sts, no events, primary gauge 20 sts/4 in = 5 sts/in, back width 20 in, and 140 rows/20 in. Applying user gauge 5.08 produced 102 sts and a 20 sts/4 in gauge block with `stsPerIn = 5.08`; the width drift was within tolerance, but validation blocked with `GAUGE_NORMALIZATION_MISMATCH`. `apply.ts:200–258` updates `primary.stsPerIn` and synthesizes `stsOver` from the target gauge before rebalancing. | KB §§2, 6, 17.2; `specs/engine_functions.md` §§1 and 5. | **Report only/deferred.** Coupled to A-1 and protected gauge formulas, validation, and callers. |

### B — shaping, fit, and reference data

| ID | Classification and evidence | Source/provenance | Disposition |
| --- | --- | --- | --- |
| B-1 | **Provenance discrepancy, not a confirmed source correction.** `engine/darts.ts:17–21` hard-codes short-row subtractions tight=1, average=2, loose=3 inches. Herzog PDF pp. 33–34 says to subtract approximately 2 inches for an average sweater and says tighter needs more and looser fewer; it does not supply the 1-inch and 3-inch endpoints. Herzog PDF pp. 353–354 confirms floor-to-even short-row counts and placement rules. | `C:\Projects\Knitting\extracted\herzog_extracted.md`, PDF pp. 33–34 and 353–354; KB §§10.3 and 19.4. | **Deferred/protected.** Treat the endpoints as project convention requiring provenance or decision; do not relabel or change constants/output. |
| B-2 | **Confirmed reproduction.** `validateAgainstSchematic` only computes dimensions when `recomputedWidth` recognizes `width_at_chest` (`apply.ts:750–765`). A pattern with a valid width dimension plus `armhole_depth` returns verified while only width is checked; parent appended an armhole dimension in memory and observed `verified`, with no reason for the skipped dimension. | `specs/validation_loop.md` requires requested dimensions; `specs/pattern_schema.md` accepted sweaters call for width, length, and armhole depth; KB §§13.8, 14, 15. | **Deferred/protected.** This changes shared validation/gates and is coupled to A4/B7/B8/D3 geometry scope. |
| B-3 | **Static candidate.** `schema/validate.ts:57–70` only rejects a negative value when `positive=true`; `validateSection` calls `checkArr(sec.endsAt.sts, ..., false, true)` at lines 175–179. The adjacent comment says negative ends are rejected, but the call permits them if finite/integer and Σ balances. | `specs/pattern_schema.md` §5; schema validation contract. | **Deferred/protected.** Validation/gate change; no edit or test expectation change. |
| B-4 | **Static candidate.** `schema/validatePattern` accepts `gauge: []` because the unknown boundary checks only `Array.isArray` and the validator has no non-empty/primary-gauge requirement. `AddPattern.tsx:435–441` blocks unknown method/basis/construction but does not add a missing-gauge acceptance error. A complete manual draft could therefore be accepted with no primary gauge, then fail or become advisory when an engine route needs one. | `specs/pattern_schema.md` requires one or more gauge blocks; KB §2 and §17.2 require declared or explicitly missing gauge behavior. | **Deferred/protected.** Needs an acceptance/gauge policy decision and touches schema gates and UI wording. |
| B-5 | **Static candidate.** `sectionBuilder.ts:152–180` prefers a total checkpoint but falls back to the last full-size or any checkpoint as `endsAt`. A coincidental checkpoint can become a section endpoint; Σ may catch it, but a coincidental match could survive. | Parser contract in `specs/parser_grammar.md`; KB §12. | **Report only/defer.** Parser heuristics and A1/validation coupling make independence uncertain. |
| B-6 | **Context/parity audit target.** Generic `evenIntervalSplit` (`shaping.ts:24–39`) divides events over the entire span. Righetti PDF pp. 187–192 distinguishes event spacing from reserved plain spans and gives an example using even 2/4-row intervals for 12 events over 40 rows. The generic split is not intrinsically wrong, but callers need construction/context parity checks before using it for a source-specific schedule. | `C:\Projects\Knitting\extracted\righetti_extracted.md`, PDF pp. 187–192; KB §§17.1 and 25.4. | **Deferred/protected.** A5 is resolved. Protection is due to shared downstream A6/B4/C9/D3 behavior and working-method coupling. |
| B-7 | **Audit coverage.** `ease.ts`, `applySizeEase`, `applyBust`, `capability.ts`, `CYC_*`, and `NewModification.tsx` were checked for fit/ease dependencies. No new-size grading function is currently exposed; CYC constants are measurement data only. | KB §§2, 10, 19, 22; CYC provenance comments. | **No independent correction.** Preserve constants and grade-by-table claim until A4/G2 is formally answered. |

### C — parsing, evidence, and source boundaries

| ID | Classification and evidence | Source/provenance | Disposition |
| --- | --- | --- | --- |
| C-1 | **Confirmed reproduction.** `parser/llmExtract.ts:104–130` uses a numeric token without a digit boundary in the generic `_in` branch. Parent passed `value:[10]` with evidence `Finished bust 100 cm` to `enforceEvidence`; the prefix `10` matched before the `0`, the negative `cm` lookahead did not fire, and the field was kept. | A1/A3 numeric evidence contract; `specs/parser_grammar.md` §§2–3; KB §§12–13. | **Deferred/protected.** Evidence gate and shared tokenizer are coupled to A1/A3; no edit in this batch. |
| C-2 | **Audit target.** `notation.ts:52–62` classifies a numbers-only bracket as `sizes` only when its count equals `sizeCount`, otherwise returns `unknown`; `instructions.ts:23–55` independently parses parenthesized lists and `sectionBuilder.ts:163–167` aligns short lists to trailing sizes. This is deliberate review behavior but needs commercial-PDF coverage for unusual size/repeat conventions. | A1; KB §12; `specs/parser_grammar.md` §§2–4. | **Deferred/protected.** Do not widen grammar or alter alignment. |
| C-3 | **Audit target.** `llmExtract.ts` and `web/api.ts` enforce verbatim evidence and field-specific numeric matching, while `web/classify.ts` normalizes classifier numbers without an evidence requirement because the request text is user input rather than source extraction. Keep the two trust boundaries separate in future changes. | No-invented-numbers rule; `specs/parser_grammar.md` §§2–3 and `intent_grammar.md` §5. | **No correction.** Boundary is intentional; review only if classifier fields begin to populate source IR. |
| C-4 | **Audit target.** `nlGrammar.ts:90–106` parses request gauges in per-inch and arbitrary explicit inch-span forms; metric request gauges route to the manual gauge card or classifier path. The parser’s metric source path and classifier’s over-span path use different rounding/normalization rules. | A2; KB §2; `specs/intent_grammar.md` §2.5. | **Deferred/protected.** Couple any change to A-1/A-2 and manual gauge UX. |

### D — application, privacy, and infrastructure boundaries

| ID | Classification and evidence | Source/provenance | Disposition |
| --- | --- | --- | --- |
| D-1 | **Confirmed independent privacy defect; exact patch approved.** Before this batch, `app/apps/api/extract.mjs:98–101` and `classify.mjs:138–141` consumed and logged up to 500 characters of every non-2xx upstream response. The body could contain source text or synthetic secrets, contrary to the secretless relay comments. Consuming `res.text()` also made a response-body read failure escape as a non-`ExtractHttpError` from the direct relay call. | Engineering privacy posture in both relay headers/comments; parent’s four transport-only regression cases. | **Approved and patched in this batch:** log fixed label plus numeric status only and do not consume the upstream body. Caps, requests, success handling, system rules, and client errors remain unchanged. |
| D-2 | **Static candidate with uncertain impact.** `pdf/extract.ts:43–53` creates a nested PDF worker before awaiting `getDocument(...).promise`; cleanup at lines 56–71 only runs after the promise resolves. The outer `pdfToText` wrapper in `app/apps/web/src/pdf.ts:32–35` terminates its worker on error. A nested-worker leak on document-promise rejection was not reproduced, and application impact is uncertain. | `specs/parser_grammar.md` PDF caps/confinement; PDF extraction module security comments. | **Report only.** Requires a targeted lifecycle test and parent review. |
| D-3 | **Confirmed CI reproducibility gap.** A clean checkout cannot load three suites when the ignored fixtures `tests/golden/flax-worsted/text.md` and `tests/golden/pdfs/FLAX-tincanknits-WORSTED.pdf` are absent. `.github/workflows/ci.yml` runs checkout, `npm ci`, typecheck, tests, web build, and audit but has no fixture provisioning step. Local ignored copies were supplied only for this checkout; CI was not run. | `.gitignore` fixture rules; `.github/workflows/ci.yml`; local baseline setup. | **Report only.** Do not force-add copyrighted material or change tests/fixtures in this batch; parent owns CI/setup decision. |
| D-4 | **Audit coverage.** `backup.ts` validates imported patterns/profiles/results, downgrades legacy sheets to advisory, rejects malformed nested payloads, and preserves vault conflicts. `storage.ts` uses an IndexedDB transaction and local fallback; `vault.ts` uses random salt/IV, PBKDF2-SHA256, and AES-GCM; `sw.js` excludes `/api` and uses network-first navigation. | `specs/app_ux.md`, `specs/app_plan.md`, privacy/recovery tests. | **No independent correction found.** Preserve persistence and privacy behavior. |
| D-5 | **Audit coverage.** `SheetScreen.tsx` withholds instructions unless status is verified; `Library.tsx` surfaces advisory/blocked states; `NewModification.tsx` applies the engine gate; `AddPattern.tsx` requires explicit construction/method/basis review. | `specs/validation_loop.md`, `specs/app_ux.md`; D1 resolved output contract. | **No independent correction found.** Any changes to status wording or acceptance gates are protected. |

## Batch disposition

* No DOMAIN tests were edited by this task. The parent added four transport-only regression tests; no fixture/test expectations were changed.
* D-1 is the sole approved production correction. It is transport-only and does not alter caps, request bodies, prompt rules, success parsing, or domain behavior.
* A-1, B-1/B-2, C-1, and all question-coupled candidates remain report-only until the user explicitly authorizes a protected edit after manual decisions are preserved; parent approval alone cannot waive these protections.
* C8/C9 and C5 remain source-verification gaps. G1 / question D2 bra-label fallback remains disabled. A4/G2 and C10 remain unanswered decisions.
* Local ignored copies of the Flax text/PDF were used only to make this checkout reproducible. CI provisioning remains unresolved; no copyrighted fixture was force-added.

## Parent review and verification

- Parent reproduced A-1, A-3, B-2 and C-1 using the existing TypeScript in memory.
  No domain source, test, or on-disk fixture was changed for these checks.
- The four new transport-only regression cases failed against baseline `1c63701`
  and passed after the relay patch. Full local verification passed: typecheck,
  **256 tests across 34 files**, and production web build. Existing Vite config
  format warnings remain; no dependency/configuration change was made.
- Parent reviewed the exact relay diff and corrected report scope/provenance
  claims. No UI behavior changed; no new browser session, live API request, OCR,
  performance benchmark, deployment, or GitHub CI run was used for this audit.
- `verification_checklist.md` and `knitting_knowledge_base.md` remain byte-identical
  in both main and the audit checkout. SHA-256 respectively:
  `D74D26DD81DD03FAA014DA0F1B190DB07D6363A336493FEBD45F4A0301AC45C5` and
  `CD151C70B1A43310E07AEDCD0786951BDE3CDA22B4E7D685C67B67D4413C3D13`.
- Protected policy/spec wording was left in place. This report records
  discrepancies separately and does not answer or close any manual question.

C-1 and B-2 are the highest-priority confirmed correctness findings for a future
explicitly authorized protected change. A-1/A-3 are confirmed normalization
failures. D-2 needs lifecycle reproduction; D-3 needs a copyright-safe fixture
provisioning design. None of these follow-ups is silently authorized by this
report, and the passing suite is not a claim that these defects are fixed.
