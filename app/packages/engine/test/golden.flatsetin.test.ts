import { describe, expect, it } from 'vitest';
import { applyIntent } from '../src/apply.js';
import { validatePattern } from '@knitting/schema';
import type { FitProfile, ModificationRequest } from '@knitting/shared';
import { flatSetInLike } from '../../../../tests/golden/flat-setin-like/ir.js';

/**
 * Golden: the FLAT SET-IN construction family (second MVP family).
 * Hand-computed expectations: tests/golden/flat-setin-like/expectations.md.
 */

const profile = (over: Partial<FitProfile> = {}): FitProfile => ({
  id: 'fs-golden',
  label: 'FS golden',
  displayUnit: 'in',
  ...over,
});

const req = (
  intent: ModificationRequest['intent'],
  params: ModificationRequest['params'],
  sizeIndex = 0,
): ModificationRequest => ({
  intent,
  patternId: 'Fixture Flat Set-In',
  sizeIndex,
  raw: 'golden',
  params,
});

describe('golden: flat set-in fixture (tests/golden/flat-setin-like/expectations.md)', () => {
  it('FS0 — fixture is Σ-clean (design ground truth)', () => {
    expect(validatePattern(flatSetInLike())).toEqual([]);
  });

  it('FS1 — size_ease (UT 34", ease 2") → nearest bust 34 = size S', () => {
    const { sheet, validation } = applyIntent(
      flatSetInLike(),
      req('size_ease_selection', { kind: 'size_ease', basis: 'upper_torso', targetEaseIn: 2 }),
      profile({ upperTorsoIn: 34 }),
    );
    expect(sheet.steps[0]?.title).toContain('Knit size S');
    expect(sheet.steps[0]?.instruction).toContain('34"');
    expect(sheet.steps[0]?.math.join(' ')).toContain('target ease 2" = 36"');
    expect(validation.pass).toBe(true); // advisory Σ (no dimension drift): sum checks exact
  });

  it('FS2 — gauge 5→5.5 sts/in BLOCKS on size L (odd residue 1, KB §6)', () => {
    // Hand-math: S 85→94, 69→76 (residue 2 → dec times 4→5 would pass);
    // M 95→105, 75→83 (residue 0); L 105→116, 81→89 → 116−26=90 vs 89 →
    // residue 1, not divisible by 2 → §6 throws (rebalance checks ALL sizes).
    expect(() =>
      applyIntent(flatSetInLike(), req('gauge_conversion', { kind: 'gauge', userStsPerIn: 5.5 }), profile()),
    ).toThrowError(/size 2: residue 1 not divisible by 2/);
  });

  it('FS3 — sleeve re-rate is CAP-AWARE: taper re-spaced, cap rows kept, gate passes', () => {
    // Family-aware fix: bottom-up cap sleeve (inc + BO + dec) → the taper incs
    // are re-spaced over (120 − cap span 35) = 85 rows; 10 incs → 8×5 + 9×5;
    // cap untouched; inc count unchanged → Σ intact at every size.
    const { sheet, validation, modified } = applyIntent(
      flatSetInLike(),
      req('sleeve_length_change', { kind: 'sleeve_length', deltaIn: -1.5 }, 1),
      profile(),
    );
    expect(sheet.steps[0]?.title).toContain('(taper re-spaced, cap rows kept)');
    expect(sheet.steps[0]?.instruction).toContain('every 8 ×5 + every 9 ×5');
    expect(sheet.steps[0]?.math.join(' ')).toContain('120 − cap span 35 = 85 taper rows for 10 increase rounds');
    const sleeve = modified.sections.find((s) => s.id === 'sleeve')!;
    expect(sleeve.length?.rows?.[1]).toBe(120);
    expect(sleeve.length?.in?.[1]).toBe(17);
    expect(validatePattern(modified)).toEqual([]); // full multi-size Σ + spans clean
    expect(validation.pass).toBe(true);
  });

  it('FS4 — body-length on the FLAT back+front pair updates BOTH pieces, gate passes', () => {
    // Family-aware fix: no tube body → the back+front pair takes the same
    // change (flat-set-in contract): S 14" → 16", 98 → 112 rows on each piece.
    const { sheet, validation, modified } = applyIntent(
      flatSetInLike(),
      req('body_length_change', { kind: 'body_length', deltaIn: 2 }),
      profile(),
    );
    expect(sheet.steps[0]?.title).toContain('both back and front pieces');
    const back = modified.sections.find((s) => s.id === 'back')!;
    const front = modified.sections.find((s) => s.id === 'front')!;
    expect(back.length?.in?.[0]).toBe(16);
    expect(front.length?.in?.[0]).toBe(16);
    expect(back.length?.rows?.[0]).toBe(112); // round(16 × 7)
    expect(front.length?.rows?.[0]).toBe(112);
    expect(validatePattern(modified)).toEqual([]);
    expect(validation.pass).toBe(true);
  });
});
