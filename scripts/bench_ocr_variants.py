"""2-page OCR benchmark (user-capped: MAX 2 pages) — REPORT-ONLY.

EXECUTION HISTORY: run ONCE on 2026-08-30 under explicit user authorization
(results + metric erratum in ocr_output/bench/report.md — V1 tuned-VL =
identical quality, no provable speedup; V2 classic = 47x faster but
column-interleaved; nothing adopted). Do not run again unless the user
explicitly asks.

Tests run-SETTINGS of the already-installed packages; the installation is
never modified and NOTHING is adopted automatically (user mandate 2026-08-29:
report results only, even if a variant wins). Run it ONLY when no other OCR
job is running — it loads multi-GB models and competes for CPU. All output
lands in ocr_output/bench/ exclusively.

Variants:
  V1  PaddleOCRVL v1.6 (same pipeline as the job) with call-time kwargs:
      max_pixels halved (1,003,520 -> 501,760) and max_new_tokens capped
      at 2,048 (default 4,096). Nothing persisted.
  V2  classic PaddleOCR, PP-OCRv6 (models already cached in ~/.paddlex),
      cpu_threads=16, enable_mkldnn=True — knobs that DO reach this
      all-CNN pipeline (they cannot reach the VL model in V1's pipeline).

Pages (user cap: 2): indices 12 and 22 of chunk_051_075.pdf (book pp. 63
and 73) — the densest multi-size instruction page and a narrow-column page.
Ground truth = the job's existing VL markdown for those exact pages.

Metrics: wall time (model load and predict timed separately), per-page text
similarity (difflib on whitespace-normalized text) and digit-sequence
similarity (all number tokens concatenated — what the knitting parser
actually consumes), plus V2 recognition scores for a hybrid-path estimate.

Usage:  python scripts/bench_ocr_variants.py
"""
import gc
import json
import re
import time
import warnings
from difflib import SequenceMatcher
from pathlib import Path

warnings.filterwarnings("ignore")

ROOT = Path(r"C:\Projects\Knitting")
BENCH = ROOT / "ocr_output" / "bench"
CHUNK_PDF = ROOT / "ocr_output" / "shroyer_chunks" / "chunk_051_075.pdf"
PADDLE_OUT = ROOT / "ocr_output" / "paddle_out"

# (0-based page index in the chunk, ground-truth markdown from the live job)
PAGES = [
    (12, PADDLE_OUT / "chunk_051_075_12.md"),
    (22, PADDLE_OUT / "chunk_051_075_22.md"),
]

# Historical baseline on this machine (from the job's own runs):
# ~2.5–3.5 h per 25-page chunk ≈ 6–8.5 min/page for default VL.
BASELINE_NOTE = "default VL (the running job): ~6-8.5 min/page historically"

TEST_PDF = BENCH / "bench_pages.pdf"


def build_test_pdf() -> None:
    """Extract the 2 chosen pages into ocr_output/bench/bench_pages.pdf."""
    from pypdf import PdfReader, PdfWriter

    reader = PdfReader(str(CHUNK_PDF))
    writer = PdfWriter()
    for idx, _ in PAGES:
        writer.add_page(reader.pages[idx])
    TEST_PDF.parent.mkdir(parents=True, exist_ok=True)
    with TEST_PDF.open("wb") as f:
        writer.write(f)
    print(f"test pdf: {TEST_PDF} ({len(PAGES)} pages)", flush=True)


def norm_text(s: str) -> str:
    return " ".join(s.split())


def digits_of(s: str) -> str:
    return " ".join(re.findall(r"\d+(?:[.,]\d+)?", s))


def sim(a: str, b: str) -> float:
    # autojunk=False is essential on digit strings: with the default, any char
    # exceeding 1% frequency in a 200+ char sequence becomes "junk" — and in a
    # digit string every digit qualifies, collapsing the ratio to ~0.
    return round(SequenceMatcher(None, a, b, autojunk=False).ratio(), 4)


def page_similarity(produced: str, truth: str) -> dict:
    return {
        "text_sim": sim(norm_text(produced), norm_text(truth)),
        "digit_sim": sim(digits_of(produced), digits_of(truth)),
    }


def read_saved(out_dir: Path, stem: str) -> list[str]:
    """Read back the per-page markdown files save_to_markdown wrote."""
    files = sorted(out_dir.glob(f"{stem}_*.md"), key=lambda p: p.name)
    return [f.read_text(encoding="utf-8") for f in files]


def result_text_and_scores(res) -> tuple[str, list[float]]:
    """Text + recognition scores straight from a result object (no files)."""
    scores: list[float] = []
    data = res.json if isinstance(res.json, dict) else {}
    inner = data.get("res", data)
    if isinstance(inner, dict):
        scores = [float(x) for x in (inner.get("rec_scores") or [])]
        lines = inner.get("rec_texts") or []
        if lines:
            return "\n".join(str(x) for x in lines), scores
    md = getattr(res, "markdown", None)
    if isinstance(md, dict):
        texts = md.get("markdown_texts") or ([md["markdown_text"]] if md.get("markdown_text") else [])
        if texts:
            return "\n".join(texts), scores
    return "", scores


def report_row(name: str, load_s: float, predict_s: float, page_results: list[dict]) -> dict:
    per_page = predict_s / max(len(PAGES), 1)
    row = {
        "variant": name,
        "model_load_s": round(load_s, 1),
        "predict_s_2pages": round(predict_s, 1),
        "per_page_s": round(per_page, 1),
        "pages": page_results,
    }
    print(
        f"\n== {name}: load {load_s:.0f}s, predict {predict_s:.0f}s "
        f"({per_page:.0f}s/page) ==",
        flush=True,
    )
    for i, pr in enumerate(page_results):
        print(
            f"   page {i}: text_sim={pr['text_sim']} digit_sim={pr['digit_sim']}"
            + (f" mean_rec_score={pr.get('mean_rec_score')}" if pr.get("mean_rec_score") is not None else ""),
            flush=True,
        )
    return row


def run_v1(truths: list[str]) -> dict:
    from paddleocr import PaddleOCRVL

    t0 = time.perf_counter()
    pipeline = PaddleOCRVL(pipeline_version="v1.6")
    load_s = time.perf_counter() - t0

    out_dir = BENCH / "v1"
    out_dir.mkdir(parents=True, exist_ok=True)
    t0 = time.perf_counter()
    output = pipeline.predict(
        str(TEST_PDF), max_pixels=501_760, max_new_tokens=2048
    )
    results = list(output)
    predict_s = time.perf_counter() - t0
    for res in results:
        res.save_to_markdown(save_path=str(out_dir))

    produced = read_saved(out_dir, TEST_PDF.stem)
    page_results = [page_similarity(p, t) for p, t in zip(produced, truths)]
    del pipeline, output, results
    gc.collect()
    return report_row("V1 VL max_pixels/2 + max_new_tokens 2048", load_s, predict_s, page_results)


def run_v2(truths: list[str]) -> dict:
    from paddleocr import PaddleOCR

    t0 = time.perf_counter()
    pipeline = PaddleOCR(ocr_version="PP-OCRv6", cpu_threads=16, enable_mkldnn=True)
    load_s = time.perf_counter() - t0

    out_dir = BENCH / "v2"
    out_dir.mkdir(parents=True, exist_ok=True)
    t0 = time.perf_counter()
    output = pipeline.predict(str(TEST_PDF))
    results = list(output)
    predict_s = time.perf_counter() - t0

    page_results = []
    for i, res in enumerate(results):
        text, scores = result_text_and_scores(res)
        (out_dir / f"page_{i}.txt").write_text(text, encoding="utf-8")
        pr = page_similarity(text, truths[i])
        if scores:
            pr["mean_rec_score"] = round(sum(scores) / len(scores), 4)
            pr["low_conf_lines"] = sum(1 for s in scores if s < 0.9)
        page_results.append(pr)
    del pipeline, output, results
    gc.collect()
    return report_row("V2 classic PP-OCRv6 (16 threads, mkldnn)", load_s, predict_s, page_results)


def main() -> None:
    if not CHUNK_PDF.exists():
        raise SystemExit(f"missing {CHUNK_PDF}")
    truths = [t.read_text(encoding="utf-8") for _, t in PAGES]
    build_test_pdf()

    rows = [run_v1(truths), run_v2(truths)]

    summary = {
        "baseline": BASELINE_NOTE,
        "variants": rows,
        "report_only": "NOTHING adopted — results for review (user mandate 2026-08-29)",
    }
    (BENCH / "report.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    with (BENCH / "report.md").open("w", encoding="utf-8") as f:
        f.write("# OCR benchmark — 2 pages, report-only\n\n")
        f.write(f"Baseline: {BASELINE_NOTE}\n\n")
        for r in rows:
            f.write(
                f"## {r['variant']}\n- load {r['model_load_s']}s · "
                f"predict {r['predict_s_2pages']}s ({r['per_page_s']}s/page)\n"
            )
            for i, pr in enumerate(r["pages"]):
                extra = (
                    f" · mean rec {pr['mean_rec_score']}, {pr['low_conf_lines']} low-conf lines"
                    if "mean_rec_score" in pr
                    else ""
                )
                f.write(f"- page {i}: text {pr['text_sim']}, digits {pr['digit_sim']}{extra}\n")
        f.write("\n_Report-only: no configuration adopted._\n")
    print(f"\nreport: {BENCH / 'report.md'}", flush=True)


if __name__ == "__main__":
    main()
