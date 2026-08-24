import { describe, expect, it } from 'vitest';
import { applyIntent } from '../src/apply.js';
import { flaxLike } from '../src/fixtures/flaxLike.js';
import type { FitProfile, ModificationRequest } from '@knitting/shared';

/**
 * Golden acceptance tests — numbers hand-computed in
 * tests/golden/flax-like/expectations.md (KB §2/§3/§6/§11/§17.2, Herzog §19).
 * Never regenerate these expectations from engine output.
 */

const profile = (over: Partial<FitProfile> = {}): FitProfile => ({
  id: 'golden',
  label: 'Golden profile',
  displayUnit: 'in',
  ...over,
});

const req = (
  intent: ModificationRequest['intent'],
  params: ModificationRequest['params'],
): ModificationRequest => ({ intent, patternId: 'Fixture Raglan Tee', sizeIndex: 0, raw: 'golden', params });

describe('golden: flax-like fixture (tests/golden/flax-like/expectations.md)', () => {
  it('Case A — body length +2" (size S): 19.5", 137 rows, drift 0.03", gate passes', () => {
    const { sheet, validation, modified } = applyIntent(
      flaxLike(),
      req('body_length_change', { kind: 'body_length', deltaIn: 2 }),
      profile(),
    );
    const body = modified.sections.find((s) => s.id === 'body')!;
    expect(body.length?.in?.[0]).toBe(19.5); // 17.5 + 2 (KB §11)
    expect(body.length?.rows?.[0]).toBe(137); // round(19.5 × 7) (KB §17.2)
    expect(sheet.steps[0]?.title).toContain('Body lengthened by 2"');
    expect(sheet.steps[0]?.math.join(' ')).toContain('17.5" + 2" = 19.5"');
    expect(sheet.steps[0]?.instruction).toContain('14 rounds'); // round(2 × 7), plain-span count
    expect(validation.pass).toBe(true);
    const chest = validation.dimensionChecks.find((d) => d.dimension === 'back.width_at_chest')!;
    expect(chest.recomputedIn).toBe(19.78); // 178 ÷ 4.5 ÷ 2 (§13.8, tube halved)
    expect(chest.driftIn).toBe(0.03);
    expect(validation.sumChecks.map((s) => s.detail)).toEqual([
      '178 + Σevents 0 = 178',
      '46 + Σevents -16 = 30',
    ]);
  });

  it('Case B — gauge conversion 4.5→5 sts/in: 198/51→33, times 8→9, drift 0.05", gate passes', () => {
    const { sheet, validation, modified } = applyIntent(
      flaxLike(),
      req('gauge_conversion', { kind: 'gauge', userStsPerIn: 5 }),
      profile(),
    );
    const gauge = modified.gauge.find((g) => g.primary)!;
    expect(gauge.stsPerIn).toBe(5);
    expect(gauge.stsOver).toBe(20); // round(5 × 4)
    const body = modified.sections.find((s) => s.id === 'body')!;
    expect(body.startsWith.sts[0]).toBe(198); // round(178 × 5/4.5) (KB §2 erratum)
    expect(body.endsAt.sts?.[0]).toBe(198);
    const sleeve = modified.sections.find((s) => s.id === 'sleeve')!;
    expect(sleeve.startsWith.sts[0]).toBe(51); // round(46 × 5/4.5)
    expect(sleeve.endsAt.sts?.[0]).toBe(33); // round(30 × 5/4.5)
    const dec = sleeve.events.find((e) => e.type === 'dec')!;
    expect(dec.schedule?.times[0]).toBe(9); // §6: residue 2 absorbed (8 → 9)
    expect(sheet.warnings.join(' ')).toContain('Row gauge missing'); // §17.2 step 6
    expect(validation.pass).toBe(true);
    const chest = validation.dimensionChecks.find((d) => d.dimension === 'back.width_at_chest')!;
    expect(chest.recomputedIn).toBe(19.8); // 198 ÷ 5 ÷ 2
    expect(chest.driftIn).toBe(0.05);
    expect(validation.sumChecks.map((s) => s.detail)).toEqual([
      '198 + Σevents 0 = 198',
      '51 + Σevents -18 = 33',
    ]);
  });

  it("Case B' — gauge conversion 4.5→5.5 BLOCKS: odd residue surfaces as error (KB §6)", () => {
    expect(() =>
      applyIntent(flaxLike(), req('gauge_conversion', { kind: 'gauge', userStsPerIn: 5.5 }), profile()),
    ).toThrowError(/residue 3 not divisible by 2/);
  });

  it('Case C — bust vertical darts (36.5/40, average): 2.00" dart, 5 sts/half, +1.33" comp, gate passes', () => {
    const { sheet, validation, modified } = applyIntent(
      flaxLike(),
      req('bust_accommodation', { kind: 'bust', method: 'vertical_darts', tightness: 'average' }),
      profile({ upperTorsoIn: 36.5, fullBustIn: 40 }),
    );
    // Herzog §19.3: 40 − 36.5 − 1.5 = 2.00"; round(2 × 4.5 ÷ 2) = 5 sts per half
    expect(sheet.steps[0]?.title).toContain('Vertical bust darts: +2.00"');
    expect(sheet.steps[0]?.math.join(' ')).toContain('5 sts per half');
    // §19.5: (40 − 38) × ⅔ = 1.33"
    expect(sheet.steps[1]?.title).toContain('Add 1.33"');
    // Σ-preserving pair: net 0 → endsAt unchanged
    const body = modified.sections.find((s) => s.id === 'body')!;
    expect(body.events.length).toBe(4); // 2 fixture + inc/dec dart pair
    expect(body.endsAt.sts?.[0]).toBe(178);
    expect(validation.pass).toBe(true);
  });
});
