"""One-book OCR run: Knitting Plus (Lisa Shroyer) ONLY, by explicit path.

Same flow as run_ocr.py (PaddleOCRVL v1.6 -> per-page markdown in
ocr_output/paddle_out, then move the PDF to ExtractedBooks) but pinned to a
single file so nothing else in staging can be picked up.
"""
import warnings
import shutil
from pathlib import Path

warnings.filterwarnings("ignore")

from paddleocr import PaddleOCRVL

TARGET = Path(r"C:\Projects\Knitting\PaddleOCR\BooksToExtract\Knitting Plus (Lisa Shroyer).pdf")
DONE_DIR = Path(r"C:\Projects\Knitting\PaddleOCR\ExtractedBooks")
OUT_DIR = Path(r"C:\Projects\Knitting\ocr_output\paddle_out")

if not TARGET.exists():
    raise SystemExit(f"Target PDF not found: {TARGET}")

print(f"Processing single book: {TARGET.name}", flush=True)
pipeline = PaddleOCRVL(pipeline_version="v1.6")
print("Pipeline loaded.", flush=True)

output = pipeline.predict(str(TARGET))
count = 0
for res in output:
    res.save_to_markdown(save_path=str(OUT_DIR))
    count += 1
    print(f"page {count} saved", flush=True)

DONE_DIR.mkdir(parents=True, exist_ok=True)
shutil.move(str(TARGET), DONE_DIR / TARGET.name)
print(f"Done: {count} pages -> {OUT_DIR}; moved PDF to {DONE_DIR / TARGET.name}", flush=True)
