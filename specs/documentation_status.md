# Documentation status and review coverage

## Planning follow-up — 2026-09-05

[Garment selection plan](garment_selection_plan.md) is ready for Terra High
implementation and Sol High independent validation after scoped execution
authorization. It specifies one page/select, additive garment identity, legacy
compatibility and an engine guard; no new garment formulas or generic framework.
Implementation and review have not started. The maintained registry gains this
plan; the counts below describe the dated August review, not a new full inventory.
Current status/spec references were swept for this planning change. Runtime, tests,
golden fixtures, KB and checklist are unchanged. Personal handoff/bootstrap/plan
records link the new plan. Local verification passed: typecheck, 260 tests across
34 files, and production web build. This follow-up is committed
locally; no push or deployment. The historical review below remains intact.

## August review record

Reviewed 2026-08-31. Runtime baseline: `5dfd340`; this follow-up is documentation
only. Workflow recovery (`1c63701`) and the protected audit (`e994825`, `5dfd340`)
are complete and independently reviewed. They are local commits, not yet pushed.
The last recorded origin/main is `f3e7bda`. Push requires an explicit user request.

After the documentation edits, local verification passed: **260 tests across
34 files**, typecheck and production web build.
This count includes eight mocked relay privacy/cleanup cases. No live provider,
browser, GitHub CI, OCR, performance benchmark, dependency installation or
deployment was run for this documentation task. The [golden setup guide](../tests/golden/README.md#local-fixtures-and-ci)
explains why the full local suite needs ignored user-supplied files.

## Review boundary

The sweep covers all 24 existing maintained Markdown files in the main checkout:
16 tracked documents, five local personal documents, and three local plans. This
index is the 25th document. Review means checking status and cross-references;
it does not mean rewriting every file or re-verifying every domain assertion.
The full knowledge base was read in the preceding audit; this follow-up checks
its preservation rather than repeating source certification.

The user forbids changes related to unanswered manual-question topics. Protected
contracts, golden expectations, the entire knowledge base and the checklist are
preserved. Their discrepancies are recorded below instead of silently changing
answers, formulas, source claims, expected numbers, gates or output wording.
The [domain audit](domain_audit.md) remains the risk/protection map.

Excluded from editing: dependency documentation, generated build files, book/PDF
extracts (including `tests/golden/flax-worsted/text.md`), OCR/research source
artifacts, backups, `.zcode/review/pre-integration-docs/`, and historical worktree
copies. These are dependencies, source evidence or snapshots, not current main
status documents. Personal docs and plans remain gitignored; never force-add them.

## Tracked documents

| Document | Review disposition |
|---|---|
| [AGENTS.md](../AGENTS.md) | Updated to record the existing user protection rule and link this index. Other standing rules unchanged. |
| [Web README](../app/apps/web/README.md) | Updated audit scope to include stream cleanup, separated earlier batches from current work, linked fixture setup and review coverage. |
| [App plan](app_plan.md) | Updated milestones/QA for workflow recovery and the accepted audit; removed completed work from follow-ups. Protected domain paragraphs retained. |
| [App UX](app_ux.md) | Reviewed unchanged: already describes session drafts, vault purge and backup limits. No UI changed in the audit/sweep. |
| [Domain audit](domain_audit.md) | Added accepted-commit and documentation-sweep status; findings and protection map unchanged. |
| [Engine functions](engine_functions.md) | Reviewed unchanged under protection; audit findings qualify its implementation claims. |
| [Intent grammar](intent_grammar.md) | Reviewed unchanged under protection; legacy count and illustrative syntax issues are recorded below. |
| [Parser grammar](parser_grammar.md) | Reviewed unchanged under protection; staged pipeline/partial-import boundary still applies. |
| [Pattern schema](pattern_schema.md) | Reviewed unchanged under protection; conceptual examples are not the complete runtime schema. |
| [Validation loop](validation_loop.md) | Reviewed unchanged under protection; audit B-2 records the incomplete dimension-check behavior. |
| [Golden README](../tests/golden/README.md) | Added local fixture prerequisites, CI limitation and review pointers; acceptance criteria unchanged. |
| [Flax-like expectations](../tests/golden/flax-like/expectations.md) | Reviewed unchanged under protection; stale concluding TODO recorded below. |
| [Flax-worsted expectations](../tests/golden/flax-worsted/expectations.md) | Reviewed unchanged under protection; stale concluding TODO recorded below. |
| [Flat set-in expectations](../tests/golden/flat-setin-like/expectations.md) | Reviewed unchanged; no fixtures or expected numbers changed. |
| [Keith Moon expectations](../tests/golden/keith-moon-like/expectations.md) | Reviewed unchanged; no fixtures, source claims or expected numbers changed. |
| [Tools README](../tools/README.md) | Added current scope and explicit OCR/benchmark authorization reminder; no tooling change. |

## Local personal documents and plans

These files exist only on the local machine; links are not required for a GitHub reader.

| Document | Review disposition |
|---|---|
| `CODEX_HANDOFF.md` | Updated main versus audit-worktree state, documentation coverage, verification and push queue. |
| `PROJECT_PROMPT.md` | Updated file registry and current implementation/documentation status. |
| `KNOWLEDGE_PLAN.md` | Updated registry, phase status, current Git queue and appended this session's log; historical counts stay historical. |
| `verification_checklist.md` | Byte-identical. Its workflow-review count is a historical snapshot; current application status lives here and in the handoff. No questions or answers changed. |
| `knitting_knowledge_base.md` | Byte-identical. No source claims, tables, rules or question-related material changed. |
| `.zcode/plans/workflow-recovery-2026-08-30.md` | Added historical-scope pointer to current status; original completed work packages preserved. |
| `.zcode/plans/plan-sess_b7de12f4-2967-4af3-99ae-93465e8ed3ce.md` | Marked the OCR benchmark plan completed/historical, with no new execution or adoption authorization. |
| `.zcode/plans/plan-sess_59bbb739-f4de-418f-9946-9c2a66973c0d.md` | Reviewed unchanged: already prominently marked historical/superseded; its old roadmap is not a current queue. |

Protected-file SHA-256 values remain those recorded in the accepted audit:

| File | SHA-256 |
|---|---|
| `verification_checklist.md` | `D74D26DD81DD03FAA014DA0F1B190DB07D6363A336493FEBD45F4A0301AC45C5` |
| `knitting_knowledge_base.md` | `CD151C70B1A43310E07AEDCD0786951BDE3CDA22B4E7D685C67B67D4413C3D13` |

## Preserved discrepancies, not new work authorization

- Both Flax expectation documents end with an obsolete single-size dart-array
  TODO. Current `engine_functions.md` documents full per-size arrays;
  `app/packages/engine/src/apply.ts` and the existing F4b regression implement/check
  them. The protected expectations remain unchanged; this is an old status note,
  not a newly fixed domain defect or permission to rewrite their cases.
- `intent_grammar.md` says 15 grammar tests; the existing `nlGrammar.test.ts` has
  19. Its illustrative union also contains premature semicolons. These do not
  alter the executable types/tests; the protected contract is not rewritten here.
- `parser_grammar.md` repeats section number 6 after section 7. Its broad pipeline
  and `pattern_schema.md`'s examples include staged/conceptual behavior. Their
  current-boundary paragraphs and the audit must be read with those examples.
- `app_plan.md` §§4/9 describe a broader table/algorithm inventory and runtime gap
  handling than the implemented modules establish. Those protected paragraphs
  were retained; the audit inventory and dispositions are the coverage record.
- Passing tests and a spec's "implemented" label do not close the audit's protected
  normalization, evidence, provenance or validation findings. No domain correction
  or manual-source verification is claimed by this documentation sweep.
- Historical session logs and completed plans retain their original test counts,
  Git snapshots and decisions. Their dates matter; consult the current handoff
  for the active queue, and never reactivate an old OCR plan or excluded Android
  milestone from a historical record.
