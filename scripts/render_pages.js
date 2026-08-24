// Render selected PDF pages to PNG at high scale for visual verification.
// Usage: node scripts/render_pages.js "<pdf path>" <scale> <page1,page2,...> <outDir>
const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const { createCanvas } = require('canvas');

async function main() {
  const [pdfPath, scaleArg, pagesArg, outDir] = process.argv.slice(2);
  const scale = parseFloat(scaleArg || '4');
  const pages = pagesArg.split(',').map((p) => parseInt(p, 10)).filter((n) => n > 0);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  for (const n of pages) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const out = path.join(outDir, `p${String(n).padStart(3, '0')}.png`);
    fs.writeFileSync(out, canvas.toBuffer('image/png'));
    console.log(`rendered ${out} (${canvas.width}x${canvas.height})`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
