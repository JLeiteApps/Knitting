# Book/OCR tooling (local-only)

Deliberately OUTSIDE the app workspaces: `canvas` (native) and `tesseract.js`
pull a prebuilt-binary download chain (`node-pre-gyp`/`tar`) that has no
business being in the shipping app's install tree. Run locally:

```
cd tools && npm install        # native deps land HERE only
node probe_text.js "<pdf>" 1,2,3
node extract_book.js "<pdf>" out.md
node render_pages.js "<pdf>" 4 12,13 outDir
```

Python OCR (PaddleOCR) helpers stay in `scripts/` (no npm deps).

Status reviewed 2026-08-31: these are optional local knowledge tools, not an app
test/build prerequisite. No extraction, install, OCR or benchmark ran during the
documentation sweep. Existing Markdown extracts and OCR outputs are source
artifacts, not status documents to rewrite. OCR (including a single page) and
performance benchmarks require a separate explicit user request; the previously
authorized 2026-08-30 benchmark does not authorize another run or adoption of its
settings. See [agent rules](../AGENTS.md) and the
[documentation status index](../specs/documentation_status.md).
