// Crop a PNG into N horizontal bands (with optional overlap) for reliable visual transcription.
// Usage: node scripts/crop_bands.js <in.png> <outPrefix> <numBands> [overlapPct]
const fs = require('fs');
const { loadImage, createCanvas } = require('canvas');

async function main() {
  const [inPath, outPrefix, bandsArg, overlapArg] = process.argv.slice(2);
  const bands = parseInt(bandsArg, 10);
  const overlap = parseFloat(overlapArg || '8') / 100;
  const img = await loadImage(inPath);
  const bandH = Math.floor(img.height / bands);
  const ov = Math.floor(bandH * overlap);
  for (let i = 0; i < bands; i++) {
    const y = Math.max(0, i * bandH - (i > 0 ? ov : 0));
    const h = bandH + (i > 0 ? ov : 0) + (i === bands - 1 ? img.height - (i * bandH + bandH) : 0);
    const canvas = createCanvas(img.width, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, y, img.width, h, 0, 0, img.width, h);
    const out = `${outPrefix}_b${i + 1}.png`;
    fs.writeFileSync(out, canvas.toBuffer('image/png'));
    console.log(`${out} y=${y} h=${h}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
