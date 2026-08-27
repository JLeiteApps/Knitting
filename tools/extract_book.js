// Full text-layer extraction of one PDF to a markdown file with per-page headings.
// Usage: node scripts/extract_book.js "<pdf>" "<out.md>"
const fs = require('fs');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

async function main() {
  const [pdfPath, outPath] = process.argv.slice(2);
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data }).promise;
  const out = [];
  let empty = 0;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const c = await page.getTextContent();
    const text = c.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
    if (!text) empty++;
    out.push(`## PDF page ${i}${text ? '' : ' [NO TEXT LAYER]'}\n${text || '(no extractable text — page is a scan image)'}\n`);
    if (i % 50 === 0) console.log(`  ${i}/${doc.numPages}`);
  }
  fs.writeFileSync(outPath, out.join('\n'), 'utf8');
  console.log(`Done: ${doc.numPages} pages (${empty} without text layer) -> ${outPath}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
