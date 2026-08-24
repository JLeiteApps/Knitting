import warnings
import shutil
from pathlib import Path

warnings.filterwarnings("ignore")

from paddleocr import PaddleOCRVL

BOOKS_DIR = Path(r"C:\Projects\Knitting\PaddleOCR\BooksToExtract")
DONE_DIR = Path(r"C:\Projects\Knitting\PaddleOCR\ExtractedBooks")
OUT_DIR = Path(r"C:\Projects\Knitting\ocr_output\paddle_out")

pdfs = sorted(BOOKS_DIR.glob("*.pdf"))
if not pdfs:
    raise SystemExit(f"No PDFs found in {BOOKS_DIR}")

print(f"Found {len(pdfs)} PDF(s) to process")
pipeline = PaddleOCRVL(pipeline_version="v1.6")

for pdf in pdfs:
    print(f"\n=== Processing: {pdf.name} ===")
    output = pipeline.predict(str(pdf))
    for res in output:
        res.save_to_markdown(save_path=str(OUT_DIR))

    DONE_DIR.mkdir(parents=True, exist_ok=True)
    shutil.move(str(pdf), DONE_DIR / pdf.name)
    print(f"Done and moved to: {DONE_DIR / pdf.name}")

print("\nAll PDFs processed.")
