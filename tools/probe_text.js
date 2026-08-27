// Probe text-layer quality of a PDF: sample a few pages, print char counts + previews.
// Usage: node scripts/probe_text.js "<pdf>" [page,page,...]
const fs = require('fs');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

async function main() {
  const pdfPath = process.argv[2];
  const pages = (process.argv[3] || '10,30,60,100,150').split(',').map(Number);
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data }).promise;
  console.log(`${pdfPath} | pages: ${doc.numPages}`);
  for (const p of pages) {
    if (p > doc.numPages) continue;
    const pg = await doc.getPage(p);
    const c = await pg.getTextContent();
    const text = c.items.map((i) => i.str).join(' ');
    console.log(`-- p${p}: ${c.items.length} items, ${text.length} chars`);
    console.log(text.slice(0, 400).replace(/\s+/g, ' '));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
