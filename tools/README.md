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
