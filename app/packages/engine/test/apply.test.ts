import { describe, expect, it } from 'vitest';
import { applyIntent, validateAgainstSchematic } from '../src/apply.js';
import { validatePattern } from '@knitting/schema';
import type { FitProfile, ModificationRequest } from '@knitting/shared';
import { flaxLike } from '../src/fixtures/flaxLike.js';

const profile = (over: Partial<FitProfile> = {}): FitProfile => ({
  id: 'p1',
  label: 'Test',
  displayUnit: 'in',
  ...over,
});

const req = (params: ModificationRequest['params'], intent: ModificationRequest['intent']): ModificationRequest => ({
  intent,
  patternId: 'fixture',
  raw: 'test',
  params,
});

describe('fixture integrity', () => {
  it('flaxLike is Σ-clean and validates against its schematic', () => {
    expect(validatePattern(flaxLike())).toEqual([]);
    const v = validateAgainstSchematic(flaxLike(), 0);
    expect(v.pass).toBe(true);
    // width_at_chest recomputed: 178 / 4.5 = 39.56" circumference → 19.78" back vs 19.75 target
    const width = v.dimensionChecks.find((d) => d.dimension === 'back.width_at_chest')!;
    expect(width.recomputedIn).toBeCloseTo(19.78, 2);
    expect(width.driftIn).toBeLessThan(0.25);
  });
});

describe('intent 1: size_ease_selection', () => {
  it('Herzog: 39" torso, average tier → nearest finished bust', () => {
    const { sheet } = applyIntent(
      flaxLike(),
      req({ kind: 'size_ease', tier: 'average' }, 'size_ease_selection'),
      profile({ upperTorsoIn: 39, fullBustIn: 43 }),
    );
    // finished busts from schematic: 39.5 / 44 / 48.5 → target 40.5 → S (39.5)
    expect(sheet.steps[0]!.title).toContain('S');
    expect(sheet.steps.some((s) => s.title === 'Bust accommodation advised')).toBe(true);
  });
});

describe('intent 5: gauge_conversion', () => {
  it('converts all counts 4.5 → 5 sts/in and RE-DERIVES shaping (KB §6)', () => {
    const { modified, validation, sheet } = applyIntent(
      flaxLike(),
      req({ kind: 'gauge', userStsPerIn: 5 }, 'gauge_conversion'),
      profile(),
    );
    const body = modified.sections.find((s) => s.id === 'body')!;
    const sleeve = modified.sections.find((s) => s.id === 'sleeve')!;
    // 178 × 5/4.5 = 197.8 → 198; sleeve 46→51, cuff 30→33
    expect(body.startsWith.sts[0]).toBe(198);
    expect(sleeve.startsWith.sts[0]).toBe(51);
    expect(sleeve.endsAt.sts![0]).toBe(33);
    // Σ re-derived: dec times adjusted 8 → 9 so 51 − 2×9 = 33 exactly
    const dec = sleeve.events[0]!;
    expect(dec.schedule!.times[0]).toBe(9);
    expect(validation.pass).toBe(true);
    expect(sheet.steps[0]!.math[0]).toContain('5 / 4.5');
  });

  it('reports source-to-target row-gauge drift for the requested size', () => {
    const { sheet } = applyIntent(
      flaxLike(),
      { ...req({ kind: 'gauge', userStsPerIn: 5, userRowsPerIn: 8 }, 'gauge_conversion'), sizeIndex: 1 },
      profile(),
    );
    // Size M body is 17.75"; source 7 rows/in → target 8 rows/in.
    expect(sheet.warnings.join(' ')).toContain('Row-gauge drift 2.54"');
    expect(sheet.warnings.join(' ')).toContain('EXCEEDS');
  });
});

describe('intent 3: body_length_change', () => {
  it('+2" lengthens the plain span and outputs work-to-length', () => {
    const { modified, sheet } = applyIntent(
      flaxLike(),
      req({ kind: 'body_length', deltaIn: 2 }, 'body_length_change'),
      profile(),
    );
    const body = modified.sections.find((s) => s.id === 'body')!;
    expect(body.length!.in![0]).toBeCloseTo(19.5, 6);
    expect(body.length!.rows![0]).toBe(137); // 19.5" × 7 rows/in = 136.5 → 137
    expect(sheet.steps[0]!.instruction).toContain('measures 19.5');
  });
});

describe('intent 4: sleeve_length_change', () => {
  it('+1" re-rates the taper with Σ verification', () => {
    const { modified, sheet, validation } = applyIntent(
      flaxLike(),
      req({ kind: 'sleeve_length', deltaIn: 1 }, 'sleeve_length_change'),
      profile(),
    );
    // available = 70 + 7 = 77 rows for 8 dec rounds → q=9 r=5 → 9×3 + 10×5
    expect(sheet.steps[0]!.instruction).toContain('every 9 ×3 + every 10 ×5');
    expect(sheet.steps[0]!.math.join(' ')).toContain('Σ checks pass');
    const sleeve = modified.sections.find((s) => s.id === 'sleeve')!;
    expect(sleeve.events[0]!.schedule!.intervalRows[0]).toBe(9);
    expect(sleeve.events[0]!.schedule!.times[0]).toBe(3);
    expect(sleeve.events[0]!.schedule!.variantRows?.[0]).toBe(10);
    expect(sleeve.events[0]!.schedule!.variantTimes?.[0]).toBe(5);
    expect(sleeve.length!.rows![0]).toBe(77); // span tracks the re-rate
    expect(validation.pass).toBe(true);
  });

  it('re-rate touches ONLY the modified size (other sizes keep Σ intact)', () => {
    // Regression (Flax golden): the old code replicated one size's split to
    // every size, silently breaking their Σ — invisible to the gate because it
    // checks only the requested size, but caught by validatePattern.
    const { modified } = applyIntent(
      flaxLike(),
      req({ kind: 'sleeve_length', deltaIn: 1 }, 'sleeve_length_change'),
      profile(),
    );
    const sleeve = modified.sections.find((s) => s.id === 'sleeve')!;
    const sc = sleeve.events[0]!.schedule!;
    // sizes 1 and 2 keep their original 6×9 / 7×10 taper
    expect({ interval: sc.intervalRows[1], times: sc.times[1], vr: sc.variantRows?.[1], vt: sc.variantTimes?.[1] })
      .toEqual({ interval: 6, times: 9, vr: 0, vt: 0 });
    expect({ interval: sc.intervalRows[2], times: sc.times[2], vr: sc.variantRows?.[2], vt: sc.variantTimes?.[2] })
      .toEqual({ interval: 7, times: 10, vr: 0, vt: 0 });
    expect(sleeve.length!.rows!.slice(1)).toEqual([72, 74]);
    expect(validatePattern(modified)).toEqual([]); // full multi-size Σ + spans clean
  });
});

describe('intent 2: bust_accommodation', () => {
  it('vertical darts: Σ-neutral insertion (Herzog §19.3)', () => {
    const { modified, sheet, validation } = applyIntent(
      flaxLike(),
      req({ kind: 'bust', method: 'vertical_darts', tightness: 'average' }, 'bust_accommodation'),
      profile({ fullBustIn: 43, upperTorsoIn: 39 }),
    );
    // dart = 43 − 39 − 1.5 = 2.5"; perSide = round(2.5 × 4.5 / 2) = 6
    expect(sheet.steps[0]!.title).toContain('2.50');
    const body = modified.sections.find((s) => s.id === 'body')!;
    const inc = body.events.find((e) => e.type === 'inc' && e.location.startsWith('dart'))!;
    const dec = body.events.find((e) => e.type === 'dec' && e.location === 'neck_edge')!;
    expect(inc.perSideSts[0]).toBe(6);
    expect(dec.perSideSts[0]).toBe(6);
    expect(validation.pass).toBe(true); // +6×2 and −6×2 cancel; endsAt unchanged
  });

  it('short rows: floor to even, placement per §19.4', () => {
    const { sheet } = applyIntent(
      flaxLike(),
      req({ kind: 'bust', method: 'short_rows', tightness: 'average' }, 'bust_accommodation'),
      profile({ frontHemToShoulderIn: 24.5, backHemToShoulderIn: 21, fullBustIn: 43, upperTorsoIn: 39 }),
    );
    // 24.5 − 21 − 2 = 1.5" × 7 = 10.5 → 10 rows = 5 pairs
    expect(sheet.steps[0]!.title).toContain('10 rows (5 pairs)');
    expect(sheet.steps[0]!.instruction).toContain('under the fullest part');
  });

  it('negative bust ease adds the ⅔ length compensation step', () => {
    const { sheet } = applyIntent(
      flaxLike(),
      req({ kind: 'bust', method: 'vertical_darts', tightness: 'average' }, 'bust_accommodation'),
      profile({ fullBustIn: 43, upperTorsoIn: 39 }),
    );
    const comp = sheet.steps.find((s) => s.id === 'bust-length-comp')!;
    // finished bust 38 (size 0) − full bust 43 = −5 → × ⅔ = 3.33
    expect(comp.title).toContain('3.33');
  });
});

describe('validation evidence gate', () => {
  it('does not certify Σ-only data when every schematic dimension is unsupported', () => {
    const pattern = flaxLike();
    pattern.schematic = [
      { piece: 'sleeve', dimension: 'upper_arm_width', in: [10, 11, 12] },
    ];
    const validation = validateAgainstSchematic(pattern, 0);
    expect(validation.status).toBe('advisory');
    expect(validation.pass).toBe(false);
    expect(validation.dimensionChecks).toHaveLength(0);
    expect(validation.sumChecks.length).toBeGreaterThan(0);
    expect(validation.reasons.join(' ')).toContain('no supported dimension can be recomputed');
  });
});
