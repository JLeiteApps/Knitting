import { describe, expect, it } from 'vitest';
import { applyIntent } from '../src/apply.js';
import { validatePattern } from '@knitting/schema';
import type { FitProfile, ModificationRequest } from '@knitting/shared';
import { keithMoonGolden } from '../../../../tests/golden/keith-moon-like/ir.js';

/**
 * Golden acceptance tests — Keith Moon (Kate Davies, *Yokes*, 2014): the third
 * MVP construction family, bottom-up circular yoke (KB §21.1/§21.2
 * "single-round shaping"). All numbers hand-derived in
 * tests/golden/keith-moon-like/expectations.md from the book text; never
 * regenerate from engine output.
 */

const profile = (over: Partial<FitProfile> = {}): FitProfile => ({
  id: 'km-golden',
  label: 'Keith Moon golden profile',
  displayUnit: 'in',
  ...over,
});

const req = (
  intent: ModificationRequest['intent'],
  params: ModificationRequest['params'],
): ModificationRequest => ({
  intent,
  patternId: 'Keith Moon — golden',
  sizeIndex: 1, // size 4 of [1, 4, 7, 10]
  raw: 'golden',
  params,
});

describe('golden: Keith Moon, bottom-up yoke (tests/golden/keith-moon-like/expectations.md)', () => {
  it('KM1 — hand-derived IR is Σ-clean (transcription ground truth)', () => {
    expect(validatePattern(keithMoonGolden())).toEqual([]);
  });

  it('KM2 — body length +2" (size 4): plain tube 6.33", 38 rows, gate passes', () => {
    const { sheet, validation, modified } = applyIntent(
      keithMoonGolden(),
      req('body_length_change', { kind: 'body_length', deltaIn: 2 }),
      profile(),
    );
    // The change lands in the PLAIN tube above bust shaping (KB §11), never in
    // the shaped lower body — the family rule for a shaped bottom-up body.
    const plain = modified.sections.find((s) => s.id === 'body')!;
    const lower = modified.sections.find((s) => s.id === 'body_lower')!;
    expect(plain.length?.in?.[1]).toBe(6.33); // 4.33 + 2
    expect(plain.length?.rows?.[1]).toBe(38); // round(6.33 × 6)
    expect(lower.length?.in?.[1]).toBe(13.67); // untouched
    expect(sheet.steps[0]?.instruction).toContain('12 rounds'); // round(2 × 6)
    expect(sheet.steps[0]?.math.join(' ')).toContain('4.33" + 2" = 6.33"');
    expect(validation.pass).toBe(true);
    const chest = validation.dimensionChecks.find((d) => d.dimension === 'back.width_at_chest')!;
    expect(chest.recomputedIn).toBe(18.89); // 170 ÷ 4.5 ÷ 2 (§13.8)
    expect(chest.driftIn).toBeCloseTo(0.01, 2);
    expect(validatePattern(modified)).toEqual([]); // all sizes clean
  });

  it('KM3 — gauge conversion 4.5→5 BLOCKS on size 4 (KB §6): residue 2, step 4', () => {
    // body_lower: 190→211, dec 2→2 ×9 (−36), inc 2→2 ×4 (+16), end 170→189
    // → residue +2, not divisible by the balancer step 2×2=4 → THROWS.
    expect(() =>
      applyIntent(keithMoonGolden(), req('gauge_conversion', { kind: 'gauge', userStsPerIn: 5 }), profile()),
    ).toThrowError(/residue 2 not divisible by 4/);
  });

  it('KM4 — bust vertical darts (34/38, average, size 4): 2.50" dart, 6 sts/half, gate passes', () => {
    const { sheet, validation, modified } = applyIntent(
      keithMoonGolden(),
      req('bust_accommodation', { kind: 'bust', method: 'vertical_darts', tightness: 'average' }),
      profile({ upperTorsoIn: 34, fullBustIn: 38 }),
    );
    // Herzog §19.3: 38 − 34 − 1.5 = 2.5"; per half round(2.5 × 4.5 ÷ 2) = 6
    expect(sheet.steps[0]?.title).toContain('Vertical bust darts: +2.50"');
    expect(sheet.steps[0]?.math.join(' ')).toContain('6 sts per half');
    expect(validation.pass).toBe(true);
    expect(validatePattern(modified)).toEqual([]); // per-size arrays clean (F4b rule)
  });

  it('KM5 — sleeve shortened 2" (size 4): compresses to 74 rows, incs never dropped, gate passes', () => {
    const { sheet, validation, modified } = applyIntent(
      keithMoonGolden(),
      req('sleeve_length_change', { kind: 'sleeve_length', deltaIn: -2 }),
      profile(),
    );
    const sleeve = modified.sections.find((s) => s.id === 'sleeve')!;
    expect(sleeve.length?.in?.[1]).toBe(12.25); // 14.25 − 2
    expect(sleeve.length?.rows?.[1]).toBe(74); // round(12.25 × 6)
    // 11 inc rounds re-spaced over the available taper span (74 − 8 cuff-dec
    // rounds − 1 hold round = 65): N/N+1 split → every 5 ×1 + every 6 ×10
    // (Σ rows 65, Σ incs 11 — count unchanged → Σ preserved, §16.2).
    const inc = sleeve.events.find((e) => e.type === 'inc')!;
    expect(inc.schedule?.times[1]).toBe(1);
    expect(inc.schedule?.intervalRows?.[1]).toBe(5);
    expect(inc.schedule?.variantRows?.[1]).toBe(6);
    expect(inc.schedule?.variantTimes?.[1]).toBe(10);
    expect(sheet.steps[0]?.instruction).toContain('every 5 ×1 + every 6 ×10');
    expect(validation.pass).toBe(true);
    expect(validatePattern(modified)).toEqual([]);
  });

  it('KM6 — size/ease (upper torso 34, ease +2): size 4 chosen, ease at torso 3.76"', () => {
    const { sheet, validation } = applyIntent(
      keithMoonGolden(),
      req('size_ease_selection', { kind: 'size_ease', basis: 'upper_torso', targetEaseIn: 2 }),
      profile({ upperTorsoIn: 34, fullBustIn: 38 }),
    );
    // 34 + 2 = 36 target → nearest finished bust of [32, 37.75, 43.5, 49.75]
    // = size 4; the sheet reports the RECOMPUTED bust (chest sts ÷ gauge):
    // 170 ÷ 4.5 = 37.78" → real ease at torso 37.76 − 34 ≈ 3.76, and advises
    // bust accommodation (−0.24" ease at full bust 38).
    const text = sheet.steps.map((s) => `${s.title} ${s.instruction}`).join(' ');
    expect(text).toContain('Knit size 4');
    expect(text).toContain('3.76');
    expect(text).toContain('bust accommodation'); // −0.24" bust ease advisory
    expect(validation.pass).toBe(true);
  });
});
