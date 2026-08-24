const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const { createCanvas } = require('canvas');

const PDF_PATH = 'C:/Projects/Knitting/books/The Knitters Handy Book of Patterns Basic Designs in Multiple Sizes  Gauges (Ann Budd).pdf';
const IMG_DIR = 'C:/Projects/Knitting/ocr_output/ann_budd_pages';

async function main() {
  if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });
  const data = new Uint8Array(fs.readFileSync(PDF_PATH));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  console.log(`Total pages: ${doc.numPages}`);

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const pngData = canvas.toBuffer('image/png');
    const outPath = path.join(IMG_DIR, `page_${String(i).padStart(3, '0')}.png`);
    fs.writeFileSync(outPath, pngData);
    if (i % 10 === 0) console.log(`  Rendered ${i}/${doc.numPages}`);
  }
  console.log('Done rendering all pages to PNG.');
}

main().catch(console.error);
