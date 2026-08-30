import type { Pattern } from '@knitting/schema';

/**
 * Hand-derived golden IR for Keith Moon from Kate Davies' *Yokes* (2014),
 * hand-transcribed from extracted/yokes_extracted.md (PDF pp. 57–61 =
 * printed pp. 55–59; derivations with page cites in expectations.md).
 * Subset: sizes 1 / 4 / 7 / 10 of 10 (spread across the range; includes
 * both neck groups 108 and 120).
 *
 * NOT engine output — this is the hand-verified ground truth the engine is
 * acceptance-tested against. Σ-clean by transcription (validatePattern = []).
 * All dec-round chains hand-verified for every size before subsetting.
 */
export function keithMoonGolden(): Pattern {
  return {
    schemaVersion: '0.1',
    meta: {
      name: 'Keith Moon — golden',
      designer: 'Kate Davies',
      publisher: 'Kate Davies Designs',
      year: 2014,
      pdfRef: 'Yokes (Kate Davies).pdf',
      parseDate: '2026-08-30',
    },
    sizing: {
      labels: ['1', '4', '7', '10'],
      sizeCount: 4,
      measurementBasis: 'finished',
      bustOrChestIn: [32, 37.75, 43.5, 49.75],
      notes: 'sizing table "bust" row (PDF p.57): 32 (33¼, 35½, 37¾, 39½, 41¼, 43½, 45¼, 47, 49¾) in',
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
        raw: 'gauge: 18 sts and 24 rounds to 10cm / 4in over stockinette worked in the round on 4.5mm needles (PDF p.58)',
      },
    ],
    construction: {
      direction: 'bottom_up',
      working: [{ scope: 'sections:body', method: 'in_the_round' }],
      type: 'bottom_up_yoke',
      pieces: ['body', 'sleeve', 'yoke'],
    },
    schematic: [
      // finished bust / 2; recomputes from the body section's chest checkpoint
      { piece: 'back', dimension: 'width_at_chest', in: [16, 18.88, 21.75, 24.88], src: 'sizing table bust / 2 (PDF p.57)' },
      { piece: 'sleeve', dimension: 'top_circumference', in: [12.99, 15.16, 16.93, 17.72], src: 'upper arm circumference 32.5/38.5/43/45 cm (PDF p.57)' },
      { piece: 'yoke', dimension: 'depth_at_front', in: [8.25, 9.5, 10.75, 11.75], src: 'yoke depth 21/24/27/30 cm (PDF p.57)' },
    ],
    stitchPatterns: [],
    sections: [
      {
        id: 'body_lower',
        // distinct piece name: the engine's body-length/dart routes target the
        // PLAIN tube (piece 'body') per KB §11 — the shaped lower section is
        // deliberately not addressable as the body tube.
        piece: 'body_lower',
        method: 'in_the_round',
        // provisional CO + folded hem facing joins at the same count (PDF p.58 step 1)
        startsWith: { event: 'cast_on', sts: [164, 190, 216, 240] },
        // end of bust shaping (PDF p.59 step 3): 144 (…, 170, …, 196, 224) sts
        endsAt: { event: 'bust_shaped', sts: [144, 170, 196, 224] },
        length: { rows: [82, 82, 82, 76], in: [13.67, 13.67, 13.67, 12.67] },
        events: [
          {
            // waist shaping: 4 sts dec/round, every 6 rounds × 9 (size 10: ×8) (PDF p.58 step 2)
            type: 'dec',
            location: 'side:both_markers',
            perSideSts: [2, 2, 2, 2],
            schedule: { cadence: 'every', intervalRows: [6, 6, 6, 6], times: [9, 9, 9, 8] },
            src: 'p.58 (printed 56) step 2',
          },
          {
            // bust shaping: 4 sts inc/round, every 6 rounds × 4 = +16 all sizes (PDF p.59 step 3)
            type: 'inc',
            location: 'side:both_markers',
            perSideSts: [2, 2, 2, 2],
            schedule: { cadence: 'every', intervalRows: [6, 6, 6, 6], times: [4, 4, 4, 4] },
            src: 'p.59 (printed 57) step 3',
          },
        ],
        src: 'PDF pp.58-59 steps 1-3',
      },
      {
        id: 'body',
        piece: 'body',
        method: 'in_the_round',
        // plain tube from bust-shaping end to underarm; start = chest checkpoint
        startsWith: { event: 'bust_shaped', sts: [144, 170, 196, 224] },
        // underarm hold: 4 slips of 3 (4, 6, 6) sts = 12 (16, 24, 24) held (PDF p.59 step 4)
        endsAt: { event: 'underarm_hold', sts: [132, 154, 172, 200] },
        length: { rows: [20, 26, 32, 38], in: [3.33, 4.33, 5.33, 6.33] },
        events: [
          {
            // held on waste yarn (modeled bind_off — identical count effect)
            type: 'bind_off',
            location: 'underarm:both',
            perSideSts: [6, 8, 12, 12],
            schedule: { cadence: 'at_once', intervalRows: [1, 1, 1, 1], times: [1, 1, 1, 1] },
            src: 'p.59 (printed 57) step 4 — sts on waste yarn',
          },
        ],
        src: 'PDF p.59 step 4',
      },
      {
        id: 'sleeve',
        piece: 'sleeve',
        method: 'in_the_round',
        // provisional CO + folded cuff facing at the same count (PDF p.59 step 5)
        startsWith: { event: 'cast_on', sts: [48, 50, 56, 60] },
        // underarm hold: 2 slips of 3 (4, 6, 6) = 6 (8, 12, 12) held
        endsAt: { event: 'underarm_hold', sts: [52, 60, 68, 68] },
        length: { rows: [86, 86, 91, 91], in: [14.25, 14.25, 15.25, 15.25] },
        events: [
          {
            // cuff-area decs: 2 sts dec/round × 2 rounds, every 4 rounds
            type: 'dec',
            location: 'each_end',
            perSideSts: [1, 1, 1, 1],
            schedule: { cadence: 'every', intervalRows: [4, 4, 4, 4], times: [2, 2, 2, 2] },
            src: 'p.59 (printed 57) step 5 — 4 sts dec',
          },
          {
            // inc taper: 2 sts inc/round; step D = 8 (6, 3, 4) knit rounds → every 9 (7, 4, 5);
            // 7 (11, 14, 12) inc rounds = +14 (22, 28, 24) (PDF p.59 step 5)
            type: 'inc',
            location: 'each_end',
            perSideSts: [1, 1, 1, 1],
            schedule: { cadence: 'every', intervalRows: [9, 7, 4, 5], times: [7, 11, 14, 12] },
            src: 'p.59 (printed 57) step 5',
          },
          {
            // held on waste yarn (modeled bind_off)
            type: 'bind_off',
            location: 'underarm:both',
            perSideSts: [3, 4, 6, 6],
            schedule: { cadence: 'at_once', intervalRows: [1, 1, 1, 1], times: [1, 1, 1, 1] },
            src: 'p.59 (printed 57) step 5 — sts on waste yarn',
          },
        ],
        src: 'PDF p.59 step 5',
      },
      {
        id: 'yoke',
        piece: 'yoke',
        method: 'in_the_round',
        // join round at centre back (PDF p.59 step 6): 236 (…, 274, …, 300, 336)
        startsWith: { event: 'join', sts: [236, 274, 300, 336] },
        // final yoke count = collar pickup count (PDF p.61 step 8): 108 (…, 108, …, 112, 120)
        endsAt: { event: 'bind_off', sts: [108, 108, 112, 120] },
        length: { rows: [50, 57, 65, 71], in: [8.25, 9.5, 10.75, 11.75] },
        events: [
          {
            // yoke dec round 1: 48 (56, 68, 78) sts dec after 15 (18, 20, 20) plain CC2 rounds
            type: 'dec',
            location: 'around:evenly',
            perSideSts: [24, 28, 34, 39],
            schedule: { cadence: 'every', intervalRows: [16, 19, 21, 21], times: [1, 1, 1, 1] },
            src: 'p.60 (printed 58) step 7 — dec round 1',
          },
          {
            // yoke dec round 2: 38 (44, 50, 58) sts dec after 8 (8, 10, 10) MC rounds
            type: 'dec',
            location: 'around:evenly',
            perSideSts: [19, 22, 25, 29],
            schedule: { cadence: 'every', intervalRows: [9, 9, 11, 11], times: [1, 1, 1, 1] },
            src: 'p.60 (printed 58) step 7 — dec round 2',
          },
          {
            // yoke dec round 3: 42 (66, 70, 80) sts dec after 10 (14, 15, 20) CC1 rounds
            type: 'dec',
            location: 'around:evenly',
            perSideSts: [21, 33, 35, 40],
            schedule: { cadence: 'every', intervalRows: [11, 15, 16, 21], times: [1, 1, 1, 1] },
            src: 'p.60-61 (printed 58-59) step 7 — dec round 3',
          },
        ],
        src: 'PDF pp.59-61 steps 6-7',
      },
    ],
    finishing:
      'Collar: knit 2 rounds, marked fold round, purl 1, knit rounds, puk same count as final yoke sts, 3-needle bind off (PDF p.61 step 8). I-cord bind-offs at hems; graft underarms.',
  };
}
