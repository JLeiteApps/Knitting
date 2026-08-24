import type { Pattern } from '@knitting/schema';

/**
 * Flax-like top-down raglan fixture — 3 sizes, Σ-clean by construction
 * (validatePattern returns []). Doubles as the seed of the golden set.
 * Gauge 18 sts & 28 rows / 4" = 4.5 sts/in, 7 rows/in.
 */
export function flaxLike(): Pattern {
  return {
    schemaVersion: '0.1',
    meta: { name: 'Fixture Raglan Tee', parseDate: '2026-08-24' },
    sizing: {
      labels: ['S', 'M', 'L'],
      sizeCount: 3,
      measurementBasis: 'finished',
      bustOrChestIn: [38, 42, 46],
    },
    gauge: [
      {
        primary: true,
        stitchPatternRef: 'stockinette',
        worked: 'in_the_round',
        stsOver: 18,
        rowsOver: 28,
        overIn: 4,
        stsPerIn: 4.5,
        rowsPerIn: 7,
        raw: '18 sts & 28 rows = 4" in St st',
      },
    ],
    construction: {
      direction: 'top_down',
      working: [{ scope: 'sections:body', method: 'in_the_round' }],
      type: 'top_down_raglan',
      pieces: ['body', 'sleeve'],
    },
    schematic: [
      { piece: 'back', dimension: 'width_at_chest', in: [19.75, 22, 24.25] },
      { piece: 'back', dimension: 'armhole_depth', in: [7, 7.5, 8] },
    ],
    stitchPatterns: [],
    sections: [
      {
        id: 'body',
        piece: 'body',
        method: 'in_the_round',
        startsWith: { event: 'join', sts: [178, 198, 218] },
        endsAt: { event: 'bind_off', sts: [178, 198, 218] },
        length: { rows: [120, 122, 124], in: [17.5, 17.75, 18] },
        events: [
          {
            type: 'dec',
            location: 'each_side_of_marker:m1',
            perSideSts: [1, 1, 1],
            schedule: { cadence: 'every', intervalRows: [8, 8, 8], times: [4, 4, 4] },
            src: 'p.3',
          },
          {
            type: 'inc',
            location: 'each_side_of_marker:m2',
            perSideSts: [1, 1, 1],
            schedule: { cadence: 'every', intervalRows: [12, 12, 12], times: [4, 4, 4] },
            src: 'p.3',
          },
        ],
        src: 'pp.3-4',
      },
      {
        id: 'sleeve',
        piece: 'sleeve',
        method: 'in_the_round',
        startsWith: { event: 'pickup', sts: [46, 50, 54] },
        endsAt: { event: 'bind_off', sts: [30, 32, 34] },
        length: { rows: [70, 72, 74] },
        events: [
          {
            type: 'dec',
            location: 'each_end',
            perSideSts: [1, 1, 1],
            schedule: { cadence: 'every', intervalRows: [6, 6, 7], times: [8, 9, 10] },
            src: 'p.4',
          },
        ],
        src: 'p.4',
      },
    ],
  };
}
