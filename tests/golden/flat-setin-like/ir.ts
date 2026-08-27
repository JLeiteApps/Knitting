import type { Pattern } from '@knitting/schema';

/**
 * Hand-written flat set-in fixture — the second MVP construction family.
 * 3 sizes, gauge 5 sts & 7 rows / 4" worked FLAT in pieces (back + front +
 * sleeves with armhole shaping and caps), Σ-clean by design: every section
 * reconciles start + Σevents = end at every size. Numbers are a designed,
 * realistic set-in (not from any published pattern).
 *
 *   back/front: CO 85 (95, 105) sts; armhole BO 4 (5, 6) sts each side,
 *   then dec 1 st each side every 2 rows × 4 (5, 6) → shoulders+neck 69 (75, 81).
 *   sleeve: CO 50 (54, 58); inc 1 each side every 6 rows × 9 (10, 11) →
 *   upper arm 68 (74, 80); cap BO 3 (4, 5) + dec 1 each side every 2 rows ×
 *   16 (17, 18) → cap top 30 (32, 34).
 */
export function flatSetInLike(): Pattern {
  const bodyEvents = [
    {
      type: 'bind_off' as const,
      location: 'each_armhole_base',
      perSideSts: [4, 5, 6],
      schedule: { cadence: 'at_once' as const, intervalRows: [1, 1, 1], times: [1, 1, 1] },
      src: 'armhole shaping',
    },
    {
      type: 'dec' as const,
      location: 'each_armhole_edge',
      perSideSts: [1, 1, 1],
      schedule: { cadence: 'every' as const, intervalRows: [2, 2, 2], times: [4, 5, 6] },
      src: 'armhole shaping',
    },
  ];
  const body = {
    startsWith: { event: 'cast_on', sts: [85, 95, 105] },
    endsAt: { event: 'shoulders', sts: [69, 75, 81] },
    length: { in: [14, 14.5, 15], rows: [98, 102, 105] },
    events: bodyEvents,
  };
  return {
    schemaVersion: '0.1',
    meta: { name: 'Fixture Flat Set-In', parseDate: '2026-08-27' },
    sizing: {
      labels: ['S', 'M', 'L'],
      sizeCount: 3,
      measurementBasis: 'finished',
      bustOrChestIn: [34, 38, 42],
    },
    gauge: [
      {
        primary: true,
        stitchPatternRef: 'stockinette',
        worked: 'flat',
        stsOver: 20,
        rowsOver: 28,
        overIn: 4,
        stsPerIn: 5,
        rowsPerIn: 7,
        raw: '20 sts & 28 rows = 4" in St st',
      },
    ],
    construction: {
      direction: 'bottom_up',
      working: [
        { scope: 'sections:back', method: 'flat' },
        { scope: 'sections:front', method: 'flat' },
      ],
      type: 'flat_set_in',
      pieces: ['back', 'front', 'sleeve'],
    },
    schematic: [
      { piece: 'back', dimension: 'width_at_chest', in: [17, 19, 21] },
      { piece: 'back', dimension: 'armhole_depth', in: [7, 7.5, 8] },
    ],
    stitchPatterns: [],
    sections: [
      { id: 'back', piece: 'back', method: 'flat', ...body, src: 'pp.2-3' },
      { id: 'front', piece: 'front', method: 'flat', ...body, src: 'pp.3-4' },
      {
        id: 'sleeve',
        piece: 'sleeve',
        method: 'flat',
        startsWith: { event: 'cast_on', sts: [50, 54, 58] },
        endsAt: { event: 'bind_off', sts: [30, 32, 34] },
        length: { in: [18, 18.5, 19.5], rows: [126, 130, 137] },
        events: [
          {
            type: 'inc',
            location: 'each_edge',
            perSideSts: [1, 1, 1],
            schedule: { cadence: 'every', intervalRows: [6, 6, 6], times: [9, 10, 11] },
            src: 'taper',
          },
          {
            type: 'bind_off',
            location: 'cap_base_each_side',
            perSideSts: [3, 4, 5],
            schedule: { cadence: 'at_once', intervalRows: [1, 1, 1], times: [1, 1, 1] },
            src: 'cap',
          },
          {
            type: 'dec',
            location: 'cap_each_edge',
            perSideSts: [1, 1, 1],
            schedule: { cadence: 'every', intervalRows: [2, 2, 2], times: [16, 17, 18] },
            src: 'cap',
          },
        ],
        src: 'p.4',
      },
    ],
  };
}
