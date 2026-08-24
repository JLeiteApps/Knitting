import { describe, expect, it } from 'vitest';
import {
  convertCount,
  convertRows,
  driftIn,
  roundToRepeat,
  rowGaugeDrift,
} from '../src/gauge.js';
import {
  evenIntervalSplit,
  sumEvents,
  sumRows,
  taperSchedule,
} from '../src/shaping.js';
import {
  frontBellyWidth,
  negativeEaseLengthCompensation,
  shortRowDartAmount,
  shortRowPlacement,
  verticalDart,
} from '../src/darts.js';
import { recommendSizeByUpperTorso } from '../src/ease.js';
import { CYC_CHILDREN, CYC_WOMEN } from '../src/data/cyc.js';

describe('gauge conversion (KB §2/§9, formula corrected 2026-08-24)', () => {
  it('converts a cast-on between gauges preserving width: 200 @20 → 220 @22 (per 4")', () => {
    // 200 sts at 20 sts/4" = 40" wide; at 22 sts/4" the same 40" needs 220 sts.
    expect(convertCount(200, 5, 5.5)).toBe(220);
    expect(convertCount(200, 20, 22)).toBe(220);
  });

  it('rounds half stitches up (100 sts @4 → 137.5 → 138 @5.5)', () => {
    expect(convertCount(100, 4, 5.5)).toBe(138);
  });

  it('adjusts to pattern repeat multiples (tier-1 rounding, A5)', () => {
    expect(roundToRepeat(105, 4)).toBe(104);
    expect(roundToRepeat(104.5, 1)).toBe(105);
  });

  it('reports drift of a rounded count vs the exact width', () => {
    // target 40" at 5.5 sts/in = 220 sts exact; 218 sts → 39.636" → drift 0.364"
    expect(driftIn(40, 218, 5.5)).toBeCloseTo(0.3636, 3);
  });

  it('converts row counts between row gauges (§2): 140 rows @7 → 160 @8', () => {
    expect(convertRows(140, 7, 8)).toBe(160);
  });

  it('computes §17.2 row-gauge drift', () => {
    // 16" body, pattern 7 rows/in, knitter 7.5 rows/in → 16 × (7.5/7 − 1) = 1.143"
    expect(rowGaugeDrift(16, 7, 7.5)).toBeCloseTo(1.143, 2);
  });
});

describe('even-interval shaping split (KB §7/§9)', () => {
  it('KB worked example: 8 incs over 75 rows → 9×5 + 10×3', () => {
    const split = evenIntervalSplit(8, 75);
    expect(split.groups).toEqual([
      { interval: 9, times: 5 },
      { interval: 10, times: 3 },
    ]);
    expect(sumRows(split)).toBe(75);
    expect(sumEvents(split)).toBe(8);
  });

  it('even case: 8 incs over 80 rows → single group 10×8', () => {
    const split = evenIntervalSplit(8, 80);
    expect(split.groups).toEqual([{ interval: 10, times: 8 }]);
  });

  it('events every row when span equals events', () => {
    const split = evenIntervalSplit(5, 5);
    expect(split.groups).toEqual([{ interval: 1, times: 5 }]);
  });

  it('property: Σ rows = span, Σ events = events, intervals differ ≤1', () => {
    for (let events = 1; events <= 30; events++) {
      for (let span = events; span <= events + 40; span += 7) {
        const split = evenIntervalSplit(events, span);
        expect(sumRows(split)).toBe(span);
        expect(sumEvents(split)).toBe(events);
        const intervals = split.groups.map((g) => g.interval);
        expect(Math.max(...intervals) - Math.min(...intervals)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('rejects impossible schedules (events > span)', () => {
    expect(() => evenIntervalSplit(9, 8)).toThrow();
  });

  it('Budd-TD sleeve re-rate: 104→66 sts over 104 rows → 19 dec rounds split 5/6', () => {
    const t = taperSchedule(104, 66, 104);
    expect(t.decRounds).toBe(19);
    expect(t.groups).toEqual([
      { interval: 5, times: 10 },
      { interval: 6, times: 9 },
    ]);
    expect(t.verify).toBe(true);
  });
});

describe('Herzog dart math (KB §19)', () => {
  it('vertical dart: 43" bust, 39" torso, average fit → 2.5" dart; 5 sts/side at 5 sts/in', () => {
    const d = verticalDart(43, 39, 'average', 5);
    expect(d.dartWidthIn).toBeCloseTo(2.5, 6);
    expect(d.perSideSts).toBe(6); // 2.5 × 5 / 2 = 6.25 → 6
    expect(d.removal).toBe('neck_edge');
  });

  it('tighter fit subtracts less (more dart), looser subtracts more', () => {
    expect(verticalDart(43, 39, 'tight', 5).dartWidthIn).toBeCloseTo(3, 6);
    expect(verticalDart(43, 39, 'loose', 5).dartWidthIn).toBeCloseTo(2, 6);
  });

  it('no dart when the difference is inside the allowance', () => {
    expect(verticalDart(40, 39, 'average', 5).dartWidthIn).toBe(0);
  });

  it('belly variant: front 24 vs back 22 at mid-hip → 1" extra front', () => {
    expect(frontBellyWidth(24, 22)).toBe(1);
  });

  it('short-row amount: 1.5" wanted at 6 rows/in → 8 rows = 4 pairs (floor to even)', () => {
    // Herzog worked example: 1½" × 6 = 9 → round down to 8
    const r = shortRowDartAmount(24.5, 21, 'average', 6); // 24.5−21−2 = 1.5
    expect(r.amountIn).toBeCloseTo(1.5, 6);
    expect(r.rows).toBe(8);
    expect(r.pairs).toBe(4);
  });

  it('short-row placement: hem-to-armhole 12.5" → start at 10.5", finish 1–2" before armhole', () => {
    const p = shortRowPlacement(12.5);
    expect(p.startAtIn).toBe(10.5);
    expect(p.finishBeforeArmholeMinIn).toBe(1);
    expect(p.finishBeforeArmholeMaxIn).toBe(2);
    expect(p.shortestPairSpanIn(7)).toBe(9); // 2" wider than apex span
  });

  it('negative-ease compensation: 1" bust negative ease → ⅔" added length', () => {
    expect(negativeEaseLengthCompensation(1)).toBeCloseTo(2 / 3, 6);
    expect(negativeEaseLengthCompensation(3)).toBeCloseTo(2, 6);
  });
});

describe('size selection (Herzog §19.1)', () => {
  const sizes = [32, 36, 40, 44, 48];

  it('Herzog example: 43" bust / 39" torso → size 39–41 for average fit', () => {
    // available sizes step 4: nearest to 39+1.5=40.5 is 40
    const r = recommendSizeByUpperTorso(39, 1.5, sizes);
    expect(r.finishedBustIn).toBe(40);
    expect(r.upperTorsoEaseIn).toBe(1);
  });

  it('fitted: 0 ease at upper torso picks the exact size', () => {
    const r = recommendSizeByUpperTorso(39, 0, [36, 39, 42, 45]);
    expect(r.finishedBustIn).toBe(39);
    expect(r.upperTorsoEaseIn).toBe(0);
  });

  it('ties resolve to the smaller size', () => {
    const r = recommendSizeByUpperTorso(40, 0, [38, 42]);
    expect(r.finishedBustIn).toBe(38);
  });
});

describe('CYC data integrity (KB §2, verified tables)', () => {
  it('women: 9 sizes XS–5X, chest 28–62, M waist-corrected table present', () => {
    expect(CYC_WOMEN.rows).toHaveLength(9);
    expect(CYC_WOMEN.rows[0]!.chest).toEqual([28, 30]);
    expect(CYC_WOMEN.rows[8]!.chest).toEqual([60, 62]);
  });

  it('children armhole ladder is the verified 4¼→6 sequence; depth grows monotonically with chest', () => {
    const depths = CYC_CHILDREN.rows.map((r) => r.armholeDepth![0]);
    expect(depths).toEqual([4.25, 4.75, 5, 5.5, 6]);
    for (let i = 1; i < depths.length; i++) {
      const chestStep = CYC_CHILDREN.rows[i]!.chest[0] - CYC_CHILDREN.rows[i - 1]!.chest[0];
      const depthStep = depths[i]! - depths[i - 1]!;
      expect(chestStep).toBeGreaterThan(0);
      expect(depthStep).toBeGreaterThan(0);
      // CYC child steps are +¼ to +½ per uneven chest step (the exact +½-per-2" rule
      // belongs to the BUDD sweater ladder 26–40", not this table).
      expect(depthStep).toBeGreaterThanOrEqual(0.25);
      expect(depthStep).toBeLessThanOrEqual(0.5);
    }
  });
});
