import { describe, expect, it } from 'vitest';
import { applyIntent } from '../src/apply.js';
import { validatePattern } from '@knitting/schema';
import { detectMeasurementBasis, parseGaugeStatement, segment } from '@knitting/parser';
import type { FitProfile, ModificationRequest } from '@knitting/shared';
import { flaxGolden } from '../../../../tests/golden/flax-worsted/ir.js';

/**
 * Golden acceptance tests — TCK Flax (worsted), the first REAL-pattern golden
 * case. All numbers hand-derived in tests/golden/flax-worsted/expectations.md
 * from the PDF text; never regenerate from engine output.
 */

const profile = (over: Partial<FitProfile> = {}): FitProfile => ({
  id: 'flax-golden',
  label: 'Flax golden profile',
  displayUnit: 'in',
  ...over,
});

const req = (
  intent: ModificationRequest['intent'],
  params: ModificationRequest['params'],
): ModificationRequest => ({ intent, patternId: 'Flax (worsted) — golden', sizeIndex: 1, raw: 'golden', params });

describe('golden: TCK Flax worsted (tests/golden/flax-worsted/expectations.md)', () => {
  it('F0 — notation layer reads the verbatim PDF lines (p.2/p.3)', () => {
    // p.2: "gauge: 18 sts & 24 rounds / 4” in stockinette on larger needles."
    const g = parseGaugeStatement('gauge: 18 sts & 24 rounds / 4” in stockinette on larger needles.');
    expect(g).not.toBeNull();
    expect(g?.stsPerIn).toBe(4.5);
    expect(g?.rowsPerIn).toBe(6);
    const segs = segment('gauge: 18 sts & 24 rounds / 4” in stockinette on larger needles.');
    expect(segs[0]?.kind).toBe('gauge');
    // p.3: "The sizing table lists finished garment measurements."
    expect(detectMeasurementBasis('The sizing table lists finished garment measurements.')).toBe('finished');
    expect(segment('sizing notes: Two body length options are given.')[0]?.kind).toBe('sizing');
  });

  it('F1 — hand-derived IR is Σ-clean (transcription ground truth)', () => {
    expect(validatePattern(flaxGolden())).toEqual([]);
  });

  it('F2 — body length +2" (size M): 16", 96 rows, 12 rounds, drift 0.11", gate passes', () => {
    const { sheet, validation, modified } = applyIntent(
      flaxGolden(),
      req('body_length_change', { kind: 'body_length', deltaIn: 2 }),
      profile(),
    );
    const body = modified.sections.find((s) => s.id === 'body')!;
    expect(body.length?.in?.[1]).toBe(16); // 14 + 2 (KB §11)
    expect(body.length?.rows?.[1]).toBe(96); // round(16 × 6) (KB §17.2)
    expect(sheet.steps[0]?.instruction).toContain('12 rounds'); // round(2 × 6)
    expect(sheet.steps[0]?.math.join(' ')).toContain('14" + 2" = 16"');
    expect(validation.pass).toBe(true);
    const chest = validation.dimensionChecks.find((d) => d.dimension === 'back.width_at_chest')!;
    expect(chest.recomputedIn).toBe(19.11); // 172 ÷ 4.5 ÷ 2 (§13.8)
    expect(chest.driftIn).toBe(0.11);
    expect(validation.sumChecks.map((s) => s.detail)).toEqual([
      '120 + Σevents 128 = 248', // yoke: R1-2 ×16 × +8
      '172 + Σevents 0 = 172', // body: no shaping (Flax is a plain tube)
      '58 + Σevents -18 = 40', // sleeve: 9 dec rounds × 2
    ]);
  });

  it('F3 — gauge conversion 4.5→5 sts/in BLOCKS on real data (KB §6): yoke residue −13', () => {
    // size M: 120→133, 248→276, per-side 4 stays 4 → 133+128 = 261 ≠ 276;
    // size S checked first: 120→120, 228→253 → residue −13, step 8 → not divisible.
    expect(() =>
      applyIntent(flaxGolden(), req('gauge_conversion', { kind: 'gauge', userStsPerIn: 5 }), profile()),
    ).toThrowError(/sections\[yoke\] size 0: residue -13 not divisible by 8/);
  });

  it('F4 — bust vertical darts (34/38, average, size M): 2.50" dart, 6 sts/half, gate passes', () => {
    const { sheet, validation, modified } = applyIntent(
      flaxGolden(),
      req('bust_accommodation', { kind: 'bust', method: 'vertical_darts', tightness: 'average' }),
      profile({ upperTorsoIn: 34, fullBustIn: 38 }),
    );
    // Herzog §19.3: 38 − 34 − 1.5 = 2.5"; per half round(2.5 × 4.5 ÷ 2) = round(5.625) = 6
    expect(sheet.steps[0]?.title).toContain('Vertical bust darts: +2.50"');
    expect(sheet.steps[0]?.math.join(' ')).toContain('6 sts per half');
    expect(sheet.steps.length).toBe(1); // finished 38 − full 38 = 0 ease → no §19.5 comp step
    const body = modified.sections.find((s) => s.id === 'body')!;
    expect(body.events.length).toBe(2); // Σ-preserving inc/dec pair
    expect(body.endsAt.sts?.[1]).toBe(172); // net 0 → unchanged
    expect(validation.pass).toBe(true);
  });

  it('F5 — sleeve length +2" (size M): 120 rows, every 13 ×6 + every 14 ×3, all sizes Σ clean', () => {
    const { sheet, validation, modified } = applyIntent(
      flaxGolden(),
      req('sleeve_length_change', { kind: 'sleeve_length', deltaIn: 2 }),
      profile(),
    );
    // available = round(108 + 2×6) = 120; taper 58→40 = 9 dec rounds over 120:
    // q=13 r=3 → 13×6 + 14×3 (Σ rows 120, Σ decs 9)
    expect(sheet.steps[0]?.instruction).toContain('every 13 ×6 + every 14 ×3');
    const sleeve = modified.sections.find((s) => s.id === 'sleeve')!;
    const sc = sleeve.events[0]!.schedule!;
    expect(sc.intervalRows[1]).toBe(13);
    expect(sc.times[1]).toBe(6);
    expect(sc.variantRows?.[1]).toBe(14);
    expect(sc.variantTimes?.[1]).toBe(3);
    expect(sleeve.length?.rows?.[1]).toBe(120);
    expect(sleeve.length?.in?.[1]).toBe(20); // 18 + 2
    // other sizes untouched (regression: the old splitField replicated M's split)
    expect({ i: sc.intervalRows[0], t: sc.times[0], vr: sc.variantRows?.[0], vt: sc.variantTimes?.[0] })
      .toEqual({ i: 7, t: 8, vr: 0, vt: 0 });
    expect(validatePattern(modified)).toEqual([]); // full multi-size Σ + spans clean
    expect(validation.pass).toBe(true);
  });

  it('F6 — sleeve shortened 2" (size M): taper COMPRESSES to 96 rows, decs never dropped', () => {
    const { sheet, modified } = applyIntent(
      flaxGolden(),
      req('sleeve_length_change', { kind: 'sleeve_length', deltaIn: -2 }),
      profile(),
    );
    // available = round(108 − 12) = 96; q=10 r=6 → 10×3 + 11×6 (Σ rows 96, Σ decs 9)
    expect(sheet.steps[0]?.instruction).toContain('every 10 ×3 + every 11 ×6');
    expect(sheet.steps[0]?.title).toContain('shortened by 2"');
    const sleeve = modified.sections.find((s) => s.id === 'sleeve')!;
    const sc = sleeve.events[0]!.schedule!;
    expect(sc.times[1]! + (sc.variantTimes?.[1] ?? 0)).toBe(9); // all 9 dec rounds kept
    expect(sleeve.length?.rows?.[1]).toBe(96);
    expect(sleeve.length?.in?.[1]).toBe(16);
    expect(validatePattern(modified)).toEqual([]);
  });
});

describe('golden: cm display unit (engine generates cm at the source)', () => {
  it('F2-cm — body length +2 (size M) renders cm terms from exact values', () => {
    const { sheet } = applyIntent(
      flaxGolden(),
      req('body_length_change', { kind: 'body_length', deltaIn: 2 }),
      profile({ displayUnit: 'cm' }),
    );
    // 14"→35.56→35.6, 2"→5.08→5.1, 16"→40.64→40.6 (each term from the exact inch value)
    expect(sheet.steps[0]?.math.join(' ')).toContain('35.6 cm + 5.1 cm = 40.6 cm');
    expect(sheet.steps[0]?.instruction).toContain('40.6 cm');
    expect(sheet.steps[0]?.instruction).not.toContain('"');
  });
});
