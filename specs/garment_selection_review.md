# Garment selection — independent validation

Date: 2026-09-05. Final verdict: **APPROVED**.

Reviewed base: `62c066c5f5881251c4b6fc81bc8f445fe7a54c60`.
Reviewed head: `bab0c5bc399a0db7def09457dc5a4244b1ae1640`.
Implementation agent: GPT-5.6 Terra, High. Validation was performed independently
by the primary Codex reviewer from the exact committed diff and a production build.
At validation time no push, deployment, paid provider call, OCR run or performance
benchmark occurred. The user later authorized pushing the accepted main history to
GitHub on 2026-09-05; validation evidence and scope did not change.

## Findings and corrections

The first implementation commit (`311758f`) passed its reported gates but failed
three independent boundary probes:

1. an explicitly present malformed `garmentKind` could use legacy construction
   fallback and appear sweater-eligible;
2. a legacy sweater opened directly in review without showing its resolved garment;
3. a late PDF completion could advance after a newer garment change.

Terra corrected these at `17e55ad`. A second diff review found that deliberately
choosing the placeholder on an existing accessory/conflicting draft displayed no
selection while the assembled draft retained or re-inferred the old accessory.
Terra corrected that at `bab0c5b` by preserving the deliberate choice as explicit
`unknown`. Focused regression tests cover all four findings. No open blocking or
actionable garment-selection finding remains.

## Acceptance cases

| ID | Result | Independent evidence |
|---|---|---|
| GS1 | PASS | `AddPattern.tsx` retains one route and a labelled native select. Production browser exposed only Sweater as enabled; unavailable choices were disabled. No new route, family module or framework exists in the diff. |
| GS2 | PASS | Browser required Sweater before paste/PDF processing, then entered the existing Parse review with construction still separately editable. Import workflow tests cover selection and partial-draft save. |
| GS3 | PASS | Import recovery tests cover session retention, save/discard, pending PDF replacement and garment-change invalidation. The final placeholder test proves an explicit unknown review state without clearing source/sections fields. Browser Back preserved a body-length value of 2. |
| GS4 | PASS | Legacy sweater resolution and edit-without-source are covered in import tests; engine tests prove equal steps and validation for legacy versus explicit sweater and preserve additive no read-time mutation. The production modification screen resolved the seeded legacy fixture as sweater and ran its supported case. |
| GS5 | PASS | Backup/storage tests retain legacy accessory and valid conflict records, while Add pattern and New modification expose truthful unavailable states and block acceptance/processing. Placeholder review retains sections and construction. |
| GS6 | PASS | Unknown-boundary validation rejects null/invalid explicit values. A direct malformed-presence probe proves eligibility and capability cannot use absence fallback. |
| GS7 | PASS | Engine tests exercise accessory, trousers, explicit unknown and conflict clones through both capability disclosure and direct `applyIntent`; all block before instructions. |
| GS8 | PASS | The legacy/explicit sweater comparison asserts equal steps and validation and preserved sweater metadata. The full pre-existing golden suite passed unchanged; no formula or golden expectation file changed. |
| GS9 | PASS | Save/reopen draft coverage retains `garmentKind`; storage validation accepts legacy/conflict and rejects malformed metadata; plaintext and encrypted-profile backup round trips preserve the field and vault ciphertext. Persistence formats and versions are unchanged. |
| GS10 | PASS | Production browser covered new import/review, resolved legacy modification, deterministic body-length output (2 dimension and 2 Sigma checks), unavailable-state disclosure, browser Back, 360 x 800 layout, and an app-shell reload with port 4173 stopped. The exact final build also ran the deterministic modification offline and reported no console warnings/errors. |

## Verification

From the isolated `codex/garment-selection` worktree at the final head:

```text
npm run typecheck   PASS
npm test            PASS — 273 tests, 35 files
npm run build:web   PASS — 57 modules transformed
git diff --check    PASS
```

The final diff adds no dependency or package change and stays within the plan's
schema, resolver, selector, capability/engine guard, tests and documentation scope.
Protected mathematical functions, golden expected values, the knowledge base and
the manual-question checklist were not changed.

## Baseline limitations

This approval is limited to garment routing and compatibility. It does not certify
complete PDF parsing, missing evidence/provenance contracts, every sweater geometry,
history results, accessory calculations or the protected findings in
`specs/domain_audit.md`. The local full suite relies on the existing ignored Flax
text/PDF fixtures and therefore is not evidence that a clean checkout's current CI
provisions those assets.
