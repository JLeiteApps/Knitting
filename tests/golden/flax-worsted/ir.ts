import type { Pattern } from '@knitting/schema';

/**
 * Hand-derived golden IR for Tin Can Knits FLAX (worsted), hand-transcribed
 * from tests/golden/pdfs/FLAX-tincanknits-WORSTED.pdf (see expectations.md for
 * the per-number derivations with page cites). Subset: adult S / M / L / XL
 * (PDF size positions 9 / 11 / 13 / 14 of 19).
 *
 * NOT engine output — this is the hand-verified ground truth the engine is
 * acceptance-tested against. Σ-clean by transcription (validatePattern = []).
 */
export function flaxGolden(): Pattern {
  return {
    schemaVersion: '0.1',
    meta: {
      name: 'Flax (worsted) — golden',
      designer: 'Tin Can Knits',
      year: 2013,
      pdfRef: 'FLAX-tincanknits-WORSTED.pdf',
      parseDate: '2026-08-24',
    },
    sizing: {
      labels: ['S', 'M', 'L', 'XL'],
      sizeCount: 4,
      measurementBasis: 'finished',
      bustOrChestIn: [34, 38, 42, 46],
      notes: 'sizing table: "The sizing table lists finished garment measurements." (p.3)',
    },
    gauge: [
      {
        primary: true,
        stitchPatternRef: 'stockinette',
        worked: 'in_the_round',
        stsOver: 18,
        rowsOver: 24,
        overIn: 4,
        stsPerIn: 4.5,
        rowsPerIn: 6,
        raw: 'gauge: 18 sts & 24 rounds / 4” in stockinette on larger needles (p.2)',
      },
    ],
    construction: {
      direction: 'top_down',
      working: [{ scope: 'sections:body', method: 'in_the_round' }],
      type: 'top_down_raglan',
      pieces: ['yoke', 'body', 'sleeve'],
    },
    schematic: [
      { piece: 'back', dimension: 'width_at_chest', in: [17, 19, 21, 23], src: 'sizing table col a / 2 (p.3)' },
      { piece: 'sleeve', dimension: 'top_circumference', in: [12, 13, 15, 16], src: 'sizing table col d (p.3)' },
      { piece: 'yoke', dimension: 'depth_at_front', in: [12, 13, 15, 16], src: 'sizing table col e (p.3)' },
    ],
    stitchPatterns: [],
    sections: [
      {
        id: 'yoke',
        piece: 'yoke',
        method: 'in_the_round',
        // after neckline increase round (p.4): 108 (…, 120, …, 124, 128) for S/M/L/XL
        startsWith: { event: 'neckline_increase', sts: [108, 120, 124, 128] },
        // at separation (p.5): 228 (…, 248, …, 284, 304)
        endsAt: { event: 'separation', sts: [228, 248, 284, 304] },
        length: { in: [12, 13, 15, 16], rows: [72, 78, 90, 96] },
        events: [
          {
            // rounds 1-2 reps (p.5): 15 (…, 16, …, 20, 16) × +8 sts
            type: 'inc',
            location: 'raglan:all_4_markers',
            perSideSts: [4, 4, 4, 4],
            schedule: { cadence: 'every', intervalRows: [2, 2, 2, 2], times: [15, 16, 20, 16] },
            src: 'p.5 rounds 1-2',
          },
          {
            // XL(+) only (p.5): rounds 3-4 ×2 = +32
            type: 'inc',
            location: 'raglan:all_4_markers',
            perSideSts: [8, 8, 8, 8],
            schedule: { cadence: 'every', intervalRows: [2, 2, 2, 2], times: [0, 0, 0, 2] },
            src: 'p.5 rounds 3-4 (XL+ only)',
          },
          {
            // XL(+) only (p.5): rounds 5-6 ×2 = +16 (front/back)
            type: 'inc',
            location: 'front_and_back',
            perSideSts: [4, 4, 4, 4],
            schedule: { cadence: 'every', intervalRows: [2, 2, 2, 2], times: [0, 0, 0, 2] },
            src: 'p.5 rounds 5-6 (XL+ only)',
          },
        ],
        src: 'p.5',
      },
      {
        id: 'body',
        piece: 'body',
        method: 'in_the_round',
        // separation round (p.6): 2 × (front 68/76/84/92 + underarm CO 8/10/10/12)
        startsWith: { event: 'separation', sts: [152, 172, 188, 208] },
        endsAt: { event: 'bind_off', sts: [152, 172, 188, 208] },
        // regular length c2 minus 2" 1x1 rib (p.6 + sizing table c1/c2)
        length: { in: [13, 14, 16, 16.5], rows: [78, 84, 96, 99] },
        events: [],
        src: 'p.6 body (no shaping; rib modeled as finishing)',
      },
      {
        id: 'sleeve',
        piece: 'sleeve',
        method: 'in_the_round',
        // set-up round (p.6): held 46/48/58/60 + pickups 2×4/5/5/6
        startsWith: { event: 'pickup', sts: [54, 58, 68, 72] },
        // long-sleeve taper end (p.7): 38 (…, 40, …, 42, 46)
        endsAt: { event: 'bind_off', sts: [38, 40, 42, 46] },
        // long sleeve from underarm (p.7) incl. 2" rib
        length: { in: [17, 18, 19, 19], rows: [102, 108, 114, 114] },
        events: [
          {
            // decrease round [2 sts dec] every 7/7/6/6 rounds × 8/9/13/13 (p.7 long sleeves)
            type: 'dec',
            location: 'each_end',
            perSideSts: [1, 1, 1, 1],
            schedule: { cadence: 'every', intervalRows: [7, 7, 6, 6], times: [8, 9, 13, 13] },
            src: 'p.7 long sleeves',
          },
        ],
        src: 'pp.6-7',
      },
    ],
    finishing: '2" 1x1 rib at body hem and cuff; 1-2" neckline rib (p.6-7).',
  };
}
