# Garment selection — implementation and independent validation plan

Date: 2026-09-05. Status: **IMPLEMENTED AND INDEPENDENTLY VALIDATED**.
Implementation: **GPT-5.6 Terra, High**. Independent validation: **primary Codex reviewer**.
Implemented from local main `62c066c` in isolated `codex/garment-selection`.
The delivered change is limited to the section-2 exception: additive field/resolver,
native selector, compatibility/capability/engine guards, focused tests and matching
documentation. No protected formula, golden expectation, parser heuristic or manual
answer changed.
Final reviewed head: `bab0c5b`; see
[the independent validation report](garment_selection_review.md).

## 1. Outcome and scope

Keep one Add pattern page. Put a garment dropdown before the upload/paste controls.
The chosen garment determines whether the existing processing path is available.
Retain the current construction review, measurements, request form and sheet flow.
Start with the existing sweater workflow; other garments are visibly unavailable.
Selecting Sweater never certifies a construction or supplies missing geometry.

This replaces the earlier chat's illustrative generic `GarmentModule` framework
and full union of garment-specific pattern schemas. Those examples were proposals,
not implementation requirements. A dropdown, one additive field and a small shared
resolver are sufficient while only one garment family has a usable engine.

Included: garment identity, legacy compatibility, dropdown/recovery, consistent
capability disclosure, and an engine guard against sending accessories through
sweater operations. No new garment formulas or construction support.

Excluded: separate garment pages; a generic form renderer; plugin/strategy classes;
empty sock/hat/trouser modules; a service layer; new packages/dependencies; dynamic
loading; rewriting the construction enum, sizing schema or entire `apply.ts`;
new measurement profiles; new parsing heuristics or LLM prompts; additional intents;
history certification, larger backups, Android, OCR or performance work.

## 2. Authorization and project constraints

The user requested this coding plan. This document does not dispatch agents or
authorize implementation by itself. On a later explicit instruction to implement
this plan, use that instruction as authorization for its stated product scope;
do not ask again for the same approved work.

AGENTS rule 10 currently protects unanswered-question dependencies, including D3
construction/capability options and A1/A3/B4/D2 shared callers. The future execution
instruction must cover a **narrow exception for the garment field, resolver,
dropdown, compatibility checks, capability/engine guards, and their tests and
documentation in this plan**. If it does not, ask for that specific exception
before the dependent edits. A plan or independent review cannot waive the rule.
Do not rewrite AGENTS or silently populate manual ANSWER fields to obtain permission.

The proposed first increment is knitted sweaters only; other families are future
scope. It does not settle all of D3, any fit constants, grading, bra conversion,
missing row gauge or short-row questions. KB and checklist remain untouched unless
the user separately supplies answers. Follow local-only/no-cost restrictions,
existing source/evidence gates, and Git rules. Commit locally; push only on request.

## 3. What already exists

- `schema/src/index.ts`: `Pattern` has no garment field. `ConstructionType` mixes
  sweater constructions with `accessory_hat`, `_sock`, `_mitten`, `_glove`, `_scarf`
  and `_tam`. Sizing is explicitly bust/chest based.
- `parser/src/draftBuilder.ts`: builds sweater sections and infers construction;
  `AddPattern.tsx` already exposes construction/direction/method review.
- `engine/src/capability.ts`: intent/construction lookup with `any` fallbacks.
  `engine/src/apply.ts`: existing intent dispatcher and construction/geometry checks.
- `backup.ts:isStoredPattern` is used by imports, store writes and hydration.
  It permits selected incomplete-draft diagnostics. Adding an error indiscriminately
  can cause old records to be filtered out on load.
- `sessionDrafts.ts` and screen revision counters already handle navigation recovery
  and stale async results. Reuse them.
- Baseline last verified: typecheck, 260 tests across 34 files, production build.
  The full suite needs ignored local Flax text/PDF assets; see [golden setup](../tests/golden/README.md).
- [Domain audit](domain_audit.md) C-1/B-2 and A-1/A-3 remain unresolved evidence,
  certification and normalization findings. This routing change does not fix them
  or make existing output generally certified.

## 4. Smallest implementation

### A. Add garment identity without migrating stored data

Add optional top-level `Pattern.garmentKind?: GarmentKind` in the schema package.
Use the finite values `sweater`, `sock`, `hat`, `mitten`, `glove`, `scarf`, `tam`,
`trousers`, `unknown`. Accessory values allow honest recognition of existing enum
entries; they do not require UI options or engine implementations for all of them.
Leave `schemaVersion: '0.1'` and backup versions as-is: this is an optional additive
field and does not change measurement semantics. Do not repurpose `bustOrChestIn`
for feet/hips. A future real accessory schema is a separate task.

Put one pure `resolveGarmentKind` helper in `schema/src/garment.ts`, exported via
`mod.ts`, so engine and web use the same interpretation without a dependency cycle.
Use a small explicit construction-to-garment mapping; no title/text guessing and
no default that treats every unrecognized construction as a sweater.

| Input | Resolution / behavior |
|---|---|
| Explicit valid garment, compatible construction | Use the explicit garment. |
| No garment; existing named sweater construction | Resolve as sweater in memory for backward compatibility. |
| No garment; existing accessory construction | Resolve to its accessory family; modifications unavailable. |
| No garment and unknown construction | Unknown; retain as a draft and ask for review. |
| Explicit `unknown` | Stay unknown; do not override the user's review state. |
| Explicit invalid type/value, including null | Reject at runtime validation; never use legacy fallback. |
| Explicit garment conflicts with known construction | Retain the validly shaped record for recovery, but block acceptance/modification and explain the conflict. |

Presence/type validation belongs in both typed and unknown-value schema boundaries
through their shared validation path. Missing/unknown/unsupported/conflicting
garment identity is a workflow eligibility issue, not a reason to silently discard
old stored records. Do not broaden `isStoredPattern`'s existing diagnostic allowlist
or weaken structural validation to make a test pass.

Use a small shared compatibility check alongside the resolver if needed. It must
distinguish garment identity from whether existing construction is known/compatible.
An explicit sweater with unknown construction still cannot become accepted or run.
Read-time resolution must not mutate storage, backup payloads or object identities.
Write the explicit selected garment only on normal user save/update. Preserve it
on `modified` patterns returned by the engine. Old backups remain readable; newly
saved records retain the field on reload and backup/restore. Do not bulk-convert data.

### B. Use the existing Add pattern screen

Add one native labelled select above PDF upload and paste:

- Placeholder: "Choose garment".
- Enabled: "Sweater".
- Disabled: "Socks — not available yet", "Hat — not available yet",
  "Mittens — not available yet", "Trousers / leggings — not available yet".
- Brief helper text: "Sweater modifications are available. Construction and
  pattern details are checked after import."

For new imports require Sweater before starting extraction/building. Keep the
existing PDF/paste implementation and normal review fields. Set garment identity
on the assembled draft; avoid modifying parser internals just to pass a constant.
Keep the existing inference/review of raglan, set-in, yoke, direction and working
method. The garment selection must never substitute for these checks.

Preserve selection in the existing `AddPatternDraft`, and include it in dirty state,
Back/navigation recovery, save/discard and existing async revision handling. On
editing a legacy sweater, show the resolved selection without requiring a fresh PDF.
On legacy unknown/accessory/conflicting data, display its state truthfully and keep
the original data available; do not auto-select Sweater or delete sections to force
compatibility. Existing accessory records need an unavailable message, not sock
measurement forms or a new import workflow.

With only Sweater enabled there is no cross-family conversion flow to implement.
Changing to the placeholder/unknown review state may suspend processing but must
retain source and entered values. In-flight PDF/LLM results cannot overwrite newer
review state. Changing a selection alone must never re-enable Run or acceptance.
Actual cross-family conversion and destructive-reset confirmation are deferred
until another garment is implemented. This supersedes the earlier chat's suggestion
to automatically clear incompatible fields on every selection change.

### C. Guard the current processing path consistently

Extend the existing capability lookup with garment context; keep one registry.
Prefer passing the pattern's garment/construction fields as a small typed object
instead of adding another independent registry. Update every caller so unknown
context cannot accidentally use an `any` fallback.

Resolve/check garment before existing capability lookup:

- Compatible sweater: continue with current construction/intent lookup and all
  existing measurement, evidence, geometry and arithmetic checks.
- Unknown, accessory, trousers or conflicting identity: return unavailable/blocked
  with a short reason; never fall through to sweater capabilities.

The `any` entries can remain as sweater-internal fallbacks behind this guard.
Do not duplicate all rows for every garment or rewrite their numeric requirements.
An "implemented" capability still does not imply that this individual pattern has
the evidence needed for a verified sheet.

Add the same garment eligibility guard at the existing `applyIntent` entry point,
before any modification is calculated. Use its existing error/result convention;
do not introduce a new exception hierarchy. The UI disabling Run is not sufficient:
direct engine calls with non-sweater data must fail without producing instructions.
Retain the current intent switch and functions. Extracting every sweater function
into a new framework provides no benefit in this increment.

In `NewModification.tsx`, use this result to show a concise unavailable/review
message for unsupported patterns and prevent processing, including deterministic
drafting/optional classifier actions. Keep the sweater request cards, direct
measurement profile and existing blocked-extension disclosures. No dynamic
measurement-form abstraction. Library may show a short garment label using the
same resolver if useful; no redesign or additional route.

### D. Likely files and limits

| Files (relative to repository root) | Expected change |
|---|---|
| `app/packages/schema/src/index.ts`, `mod.ts`, new `garment.ts`, `validate.ts` | Optional field, resolver/compatibility, enum-value validation only. |
| `app/packages/engine/src/capability.ts`, `apply.ts` | Garment guard and call-site wiring; preserve formula bodies. |
| `app/apps/web/src/screens/AddPattern.tsx`, `NewModification.tsx` | Dropdown, state retention, metadata, truthful capability gating. |
| `app/apps/web/src/screens/Library.tsx` | Only if a garment label or unavailable entry action needs it. |
| Focused schema/engine/web tests using current Vitest setup | Acceptance cases below; existing golden data stays unchanged. |
| Status/spec documentation | Describe actual final behavior, compatibility and limitations. |

Inspect persistence and parser callers, but change them only if a demonstrated
integration need remains after the additive approach. No default edits to
`FitProfile.tsx`, `shared/FitProfile`, parser grammar/LLM code, storage format,
`gauge.ts`, `darts.ts`, `shaping.ts`, `ease.ts`, CYC tables or golden fixtures.
If implementation needs a broader design, explain the concrete reason before expanding.

## 5. Terra High execution order

1. Read root instructions and this plan; confirm execution authorization in section 2.
   Check current Git state and rebase the plan's assumptions if the baseline changed.
   Use one branch/worktree, `codex/garment-selection`, without disturbing other work.
   Copy required ignored Flax assets unchanged from the local main checkout if needed.
   Never download, force-add, regenerate or skip them to obtain passing tests.
2. Run baseline checks. Implement A and C with focused resolver/boundary cases.
   Keep existing golden expectations intact and use fixture clones for new tests.
3. Implement B and the screen wiring in C. Verify real navigation and persistence.
4. Run typecheck, full tests and production build after edits; inspect the production
   browser at desktop and phone width. Use existing tools and synthetic/local data.
   No live paid provider call is needed. Follow the port/PID rule if restarting Vite.
5. Sweep docs: schema field, UX, capability/engine contract, web README, app milestones,
   documentation index, handoff/bootstrap and KNOWLEDGE_PLAN registry/queue/log.
   Edit only authorized garment-related passages; retain other protected discrepancies.
   Re-run required checks after the final documentation edits.
6. Commit logical changes locally. Deliver base SHA, implementation SHA, file/diff
   summary, acceptance-case evidence, actual test count, browser results, unresolved
   limitations and any uncommitted files. Hand that exact commit to the independent reviewer.

## 6. Acceptance cases — Terra implements; independent reviewer checks

| ID | Required observable result |
|---|---|
| GS1 | One Add pattern route/page; keyboard-accessible native select; unavailable garment options cannot start another path. No second wizard or blank family modules. |
| GS2 | New import requires selection; selecting Sweater permits existing PDF/paste flow. Construction remains independently reviewed. Real Flax still saves as a partial draft when incomplete. |
| GS3 | Selection and existing manual fields survive Back/navigation; save/discard behave as before; late PDF/LLM results cannot replace newer review state. No request is sent merely by selecting a garment. |
| GS4 | Old sweater with no garment field loads, edits without source text, and runs its existing supported case; reading it does not rewrite stored JSON. Existing known blocked cases remain blocked. |
| GS5 | Existing accessory, unknown and conflicting records remain available for recovery/backup; they cannot be accepted as actionable sweaters or run through sweater calculations. Missing family alone never deletes old drafts on hydration. |
| GS6 | Unsupported explicit values and malformed garment values cannot bypass unknown-value/typed validation; invalid values never gain compatibility through fallback. Test presence separately from absence. |
| GS7 | Direct `applyIntent` calls with accessory/trousers/unknown/conflicting identities fail without instructions. Use otherwise structurally valid fixture clones so the new guard is actually exercised. Capability disclosure agrees. |
| GS8 | Explicit compatible sweater versus legacy sweater produce equal numerical outputs, steps and validation for existing golden cases; ignore only existing volatile timestamps/additive metadata. Other sizes are untouched. Do not generate new mathematical expectations from the engine. |
| GS9 | New field survives normal save/reopen, existing IndexedDB/cache hydration and both plaintext/encrypted-profile backup round trips. Existing backup conflicts, limits and advisory-history policy retain their behavior. No change to profile ciphertext/privacy. |
| GS10 | Production browser: new import, old draft edit, deterministic modification, unavailable record, navigation/Back, phone-width layout, and existing offline path work as specified. No stale assets or console errors attributable to this change. |

Use current test infrastructure; add tests for behavioral boundaries, not copies
of the resolver implementation. Do not chase an arbitrary test count or add an E2E
framework. Group related cases in existing suites or a few focused new files.

Required commands from the checkout root:

```text
npm run typecheck
npm test
npm run build:web
```

## 7. Independent validation contract

The original plan designated Sol High. In the executed workflow, the primary
Codex reviewer performed the same independent validation after Terra's handoff;
the completed evidence and corrections are in
[the validation report](garment_selection_review.md).

Validate the exact implementation SHA against this plan and its base. Read the diff
and relevant callers yourself; Terra's report and green tests are supporting evidence.
Work sequentially after Terra's handoff so there is only one implementation writer.
Use a separate local review checkout if practical and supply ignored fixtures locally.

Review all GS1–GS10 and give each PASS, FAIL or NOT VERIFIED with a file/test/browser
reference. Independently exercise engine bypasses, legacy persistence, malformed
metadata and conflicting selections. Check `isStoredPattern`/hydration specifically
for data loss caused by new diagnostics. Confirm that mathematical functions and
golden expected values were not changed to make new tests pass.

Run all required commands yourself and perform the meaningful browser cases.
Report actual commands/results and limits; never mark a browser case verified from
a component test alone. Audit the dependency/package diff and reject unnecessary
abstraction: new framework, generic form renderer, separate garment pages, empty
family modules, duplicated formulas or a broad unrelated engine reorganization.

Record existing audit defects as baseline limitations, not newly repaired findings.
If this change worsens or relies on one to claim correctness, flag the regression.
Raise actionable findings with severity, path/line, reproduction and violated plan
case. Return them to Terra for correction; do not silently fix implementation in
parallel. Review Terra's correction SHA and rerun affected/full required checks.
Approve only the final reviewed SHA when every required case has evidence and no
blocking finding remains. A missing fixture/browser facility is NOT VERIFIED,
not a passing case. No push, deployment or merge by the reviewer.

The review deliverable: concise validation report in `specs/garment_selection_review.md`,
with reviewed base/head SHAs, GS1–GS10 dispositions, findings, verification commands,
browser evidence, known baseline risks and final verdict. Create it during review,
not now. Follow the same docs sweep/log and local-commit rules.

## 8. Historical agent handoffs (completed)

**Terra High:** Implement `specs/garment_selection_plan.md` using GPT-5.6 Terra at
High reasoning after the user authorizes its section-2 scope. Follow the minimal
design and GS1–GS10 contract. Keep one page and the existing sweater calculations.
Complete local verification, documentation and commits; give the reviewer the exact base and
head SHAs plus evidence. Do not expand into other garment engines or fix unrelated
protected findings. Do not push.

**Independent reviewer:** Independently validate Terra's
exact handed-off commit against `specs/garment_selection_plan.md`, especially
GS1–GS10, backward compatibility, engine guards and the simplicity requirements.
Run verification yourself and return concrete findings to Terra. Write the review
report specified in section 7 and approve only the final SHA actually reviewed.

## 9. Completion boundary

Done means a single garment selector reliably directs compatible sweater patterns
through today's workflow and rejects unsupported combinations without losing data.
The code has a clear place to add a second garment when its real implementation
exists. It does not mean all sweaters, accessories, parsing or formulas are verified.
