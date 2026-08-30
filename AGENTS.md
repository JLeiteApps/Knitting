# Agent rules — Knitting Pattern Adaptation project

READ FIRST, in order: `CODEX_HANDOFF.md` (quick-start + current queue for a
fresh agent session) → `PROJECT_PROMPT.md` (session bootstrap: file registry, core
rules, current state) → `KNOWLEDGE_PLAN.md` (phase status + session log) → the
status block atop `verification_checklist.md`. `knitting_knowledge_base.md` is
the domain source of truth (read fully before domain work).

Non-negotiables (full detail in PROJECT_PROMPT.md core rules):

1. **LLM parses, code computes.** Every number a user sees comes from
   deterministic, Σ-verified functions in `app/packages/engine` — never model
   math. Validation gates block sheets that don't recompute cleanly.
2. **No invented numbers.** Source tags or UNVERIFIED + a checklist item in
   the same edit.
3. **Copyright.** Methods in our own words; output is a diff-style
   modification sheet referencing the user's own pattern.
4. **Docs-staleness rule (user-mandated 2026-08-28).** When ANY task
   finishes, update the .md files it touched and sweep the status-bearing
   docs (test counts, feature/screen descriptions, phase blocks, file
   registry, queues, spec status notes) in the same session — then append
   the KNOWLEDGE_PLAN session-log line. Docs must never claim an older state
   than the code.
5. **Re-verify after every edit**, however trivial: typecheck + tests
   (+ build for web work) before calling anything done.
6. **Windows ops:** stopping the dev server can orphan the Vite child
   process serving stale transforms — kill the port's PID (`netstat -ano |
   grep 5173`) before restarting, then hard-reload the page.
7. **No monetary cost, ever** (user-mandated 2026-08-29): no paid services,
   cloud compute, or anything that spends money — local machine only.
8. **OCR benchmarks: explicit-ask only** (user-mandated 2026-08-29, amended
   2026-08-30): `scripts/bench_ocr_variants.py` has been run ONCE, under
   explicit user authorization (2026-08-30, results in `ocr_output/bench/`,
   report-only). Do not run it — or any perf benchmark — unless the user
   explicitly asks; if run: report-only, adopt nothing without an explicit
   user decision, and never while an OCR job is processing. Targeted
   single-page OCR (like BGK p.46, 2026-08-30) also requires explicit
   user authorization.
9. **Git:** commit as work lands; push to origin only when the user
   explicitly asks (first push 2026-08-30, user-authorized — the old
   no-push mandate is lifted). The personal knowledge docs stay
   unversioned (gitignored); never force-add them.

Key paths: product code `app/` (web PWA, api relays, packages) · specs
`specs/` (descriptive contracts — keep true) · golden QA `tests/golden/` ·
knowledge pipeline `extracted/`, `ocr_output/`, `books/`, `scripts/`,
`tools/` (local-only, gitignored).
