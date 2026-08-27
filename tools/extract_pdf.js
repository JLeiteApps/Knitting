const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

async function extract(filePath, outputPath) {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  let fullText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += `--- PAGE ${i} ---\n${pageText}\n\n`;
    if (i % 50 === 0) console.log(`  Page ${i}/${doc.numPages}...`);
  }
  fs.writeFileSync(outputPath, fullText, 'utf-8');
  console.log(`Done: ${doc.numPages} pages, ${fullText.length} chars -> ${outputPath}`);
}

async function main() {
  console.log('Extracting Ann Budd...');
  await extract(
    'C:/Projects/Knitting/books/The Knitters Handy Book of Patterns Basic Designs in Multiple Sizes  Gauges (Ann Budd).pdf',
    'C:/Projects/Knitting/extracted/ann_budd_extracted.txt'
  );
  console.log('Extracting Vogue Knitting...');
  await extract(
    'C:/Projects/Knitting/books/Vogue Knitting - The Ultimate Knitting Book, Completely Revised and Updated.pdf',
    'C:/Projects/Knitting/extracted/vogue_knitting_extracted.txt'
  );
  console.log('All done!');
}

main().catch(console.error);
