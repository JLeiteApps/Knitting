"""Single-page targeted OCR (user-authorized 2026-08-30): Big Girl Knits PDF p.46 —
the G1 cup/underbust/waist-shape table whose text layer is garbled."""
import warnings
from pathlib import Path
warnings.filterwarnings("ignore")
from paddleocr import PaddleOCRVL

OUT = Path(r"C:\Projects\Knitting\ocr_output\bgk_g1_page46_out")
OUT.mkdir(parents=True, exist_ok=True)
pipeline = PaddleOCRVL(pipeline_version="v1.6")
print("Pipeline loaded.", flush=True)
for res in pipeline.predict(r"C:\Projects\Knitting\ocr_output\bgk_g1_page46.pdf"):
    res.save_to_markdown(save_path=str(OUT))
print("DONE", flush=True)
