import { describe, expect, it } from 'vitest';
import { validatePattern } from '../src/validate.js';
import type { Pattern } from '../src/index.js';

function oneSizePattern(overrides: {
  endSts?: number[];
  eventTimes?: number[];
  sectionRows?: number[];
}): Pattern {
  return {
    schemaVersion: '0.1',
    meta: { name: 'Test Tee' },
    sizing: { labels: ['M'], sizeCount: 1, measurementBasis: 'finished', bustOrChestIn: [40] },
    gauge: [
      {
        primary: true,
        stitchPatternRef: 'stockinette',
        worked: 'in_the_round',
        stsOver: 20,
        rowsOver: 28,
        overIn: 4,
        stsPerIn: 5,
        rowsPerIn: 7,
      },
    ],
    construction: {
      direction: 'top_down',
      working: [{ scope: 'sections:body', method: 'in_the_round' }],
      type: 'top_down_raglan',
      pieces: ['body', 'sleeve'],
    },
    schematic: [{ piece: 'back', dimension: 'width_at_chest', in: [20] }],
    stitchPatterns: [],
    sections: [
      {
        id: 'body',
        piece: 'body',
        method: 'in_the_round',
        startsWith: { event: 'join', sts: [172] },
        endsAt: { event: 'bind_off', sts: overrides.endSts ?? [164] },
        length: { rows: overrides.sectionRows ?? [100] },
        events: [
          {
            type: 'dec',
            location: 'each_end',
            perSideSts: [1],
            schedule: { cadence: 'every', intervalRows: [8], times: overrides.eventTimes ?? [4] },
          },
        ],
      },
    ],
  };
}

describe('validatePattern (spec §5 contract)', () => {
  it('accepts a reconciling pattern (172 − 2×1×4 = 164)', () => {
    const diags = validatePattern(oneSizePattern({}));
    expect(diags).toEqual([]);
  });

  it('flags Σ mismatch when events do not reconcile checkpoints', () => {
    // end 160 but events only remove 8 → 172−8 = 164 ≠ 160
    const diags = validatePattern(oneSizePattern({ endSts: [160] }));
    expect(diags.some((d) => d.code === 'SUM_CHECK_FAILED' && d.level === 'error')).toBe(true);
  });

  it('flags per-size array length mismatch', () => {
    const p = oneSizePattern({});
    p.sections[0]!.startsWith.sts = [172, 190]; // 2 entries, sizeCount = 1
    const diags = validatePattern(p);
    expect(diags.some((d) => d.code === 'SIZE_ARRAY_LENGTH')).toBe(true);
  });

  it('flags a schedule that exceeds the section span', () => {
    const diags = validatePattern(oneSizePattern({ eventTimes: [20] })); // 8×20 = 160 > 100 rows
    expect(diags.some((d) => d.code === 'SCHEDULE_EXCEEDS_SPAN')).toBe(true);
  });

  it('flags gauge normalization mismatch', () => {
    const p = oneSizePattern({});
    p.gauge[0]!.stsPerIn = 4; // 20 over 4" implies 5
    const diags = validatePattern(p);
    expect(diags.some((d) => d.code === 'GAUGE_NORMALIZATION_MISMATCH')).toBe(true);
  });

  it('warns (not errors) when the schematic is empty', () => {
    const p = oneSizePattern({});
    p.schematic = [];
    const diags = validatePattern(p);
    expect(diags.some((d) => d.code === 'NO_SCHEMATIC' && d.level === 'warning')).toBe(true);
    expect(diags.every((d) => d.level !== 'error')).toBe(true);
  });
});
