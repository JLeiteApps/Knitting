"""Chunk-wise OCR for Knitting Plus (Lisa Shroyer) — crash-resilient retry.

The full-book run died twice silently after model load (predict buffers the
whole document; nothing is written until it ends). This runner processes the
pre-split chunks in ocr_output/shroyer_chunks/ one at a time: each chunk's
markdown lands on disk the moment it finishes, a .done marker records it, and
completed chunks are skipped on restart. Load the model ONCE, chunk forever.

Run AFTER: python scripts/split_pdf.py "PaddleOCR/BooksToExtract/Knitting
Plus (Lisa Shroyer).pdf" ocr_output/shroyer_chunks 25
"""
import shutil
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

from paddleocr import PaddleOCRVL

CHUNK_DIR = Path(r"C:\Projects\Knitting\ocr_output\shroyer_chunks")
OUT_DIR = Path(r"C:\Projects\Knitting\ocr_output\paddle_out")
DONE_DIR = Path(r"C:\Projects\Knitting\ocr_output\shroyer_chunks_done")
# Optional targeting: one chunk filename per line (e.g. "chunk_051_075.pdf"),
# processed in file order. Absent/empty -> all pending chunks in name order.
TARGETS_FILE = Path(r"C:\Projects\Knitting\ocr_output\shroyer_targets.txt")

chunks = sorted(CHUNK_DIR.glob("chunk_*.pdf"))
if not chunks:
    raise SystemExit(f"No chunk PDFs in {CHUNK_DIR} — run scripts/split_pdf.py first")

if TARGETS_FILE.exists():
    wanted = [ln.strip() for ln in TARGETS_FILE.read_text(encoding="utf-8").splitlines() if ln.strip()]
    by_name = {c.name: c for c in chunks}
    unknown = [w for w in wanted if w not in by_name]
    if unknown:
        raise SystemExit(f"targets file names unknown chunks: {unknown}")
    chunks = [by_name[w] for w in wanted]
    print(f"TARGETS ACTIVE: {len(chunks)} chunks in priority order", flush=True)

DONE_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

pending = [c for c in chunks if not (DONE_DIR / f"{c.stem}.done").exists()]
print(f"{len(chunks)} chunks total, {len(pending)} pending", flush=True)
if not pending:
    print("All chunks already done.", flush=True)
    sys.exit(0)

pipeline = PaddleOCRVL(pipeline_version="v1.6")
print("Pipeline loaded.", flush=True)

for n, chunk in enumerate(pending, 1):
    print(f"[{n}/{len(pending)}] processing {chunk.name} ...", flush=True)
    output = pipeline.predict(str(chunk))
    count = 0
    for res in output:
        res.save_to_markdown(save_path=str(OUT_DIR))
        count += 1
    (DONE_DIR / f"{chunk.stem}.done").write_text(f"{count} pages\n", encoding="utf-8")
    print(f"[{n}/{len(pending)}] {chunk.name} DONE — {count} pages saved", flush=True)

print("All chunks processed.", flush=True)
