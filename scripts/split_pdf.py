"""Split a PDF into fixed-size page-range chunks (crash-resilient OCR input).

Usage: python scripts/split_pdf.py "<pdf>" <outDir> <pagesPerChunk>
Chunk files are named chunk_<start>_<end>.pdf with 1-based inclusive ranges,
so OCR output naming carries the global page range for consolidation.
"""
import sys
from pathlib import Path

from pypdf import PdfReader, PdfWriter


def main() -> None:
    pdf_path, out_dir, per = sys.argv[1], Path(sys.argv[2]), int(sys.argv[3])
    reader = PdfReader(pdf_path)
    out_dir.mkdir(parents=True, exist_ok=True)
    total = len(reader.pages)
    for start in range(1, total + 1, per):
        end = min(start + per - 1, total)
        writer = PdfWriter()
        for p in range(start - 1, end):
            writer.add_page(reader.pages[p])
        out = out_dir / f"chunk_{start:03d}_{end:03d}.pdf"
        with open(out, "wb") as f:
            writer.write(f)
        print(f"wrote {out.name} (pages {start}-{end})", flush=True)
    print(f"done: {total} pages -> {(total + per - 1) // per} chunks", flush=True)


if __name__ == "__main__":
    main()
