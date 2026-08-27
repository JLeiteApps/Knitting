const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');

const IMG_DIR = 'C:/Projects/Knitting/ocr_output/ann_budd_pages';
const OUT_PATH = 'C:/Projects/Knitting/extracted/ann_budd_extracted.txt';

async function main() {
  const files = fs.readdirSync(IMG_DIR)
    .filter(f => f.endsWith('.png'))
    .sort();
  
  console.log(`OCR'ing ${files.length} pages...`);
  
  const worker = await Tesseract.createWorker('eng', 1, {
    logger: m => {
      if (m.status === 'recognizing text') {
        process.stdout.write(`\r  Page ${m.progress < 1 ? '' : ''}`);
      }
    }
  });

  let fullText = '';
  for (let i = 0; i < files.length; i++) {
    const filePath = path.join(IMG_DIR, files[i]);
    const { data: { text } } = await worker.recognize(filePath);
    fullText += `--- PAGE ${i + 1} ---\n${text.trim()}\n\n`;
    if ((i + 1) % 10 === 0) console.log(`  OCR'd ${i + 1}/${files.length} pages...`);
  }

  await worker.terminate();
  fs.writeFileSync(OUT_PATH, fullText, 'utf-8');
  console.log(`\nDone! ${fullText.length} chars written to ${OUT_PATH}`);
}

main().catch(console.error);
