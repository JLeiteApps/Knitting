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

  it('FS3 — sleeve re-rate on a multi-event cap sleeve BREAKS Σ — gate must block (engine TODO)', () => {
    // The sleeve intent assumes a single-event top-down taper section
    // (startsWith=upper arm → endsAt=cuff). This bottom-up cap sleeve has
    // inc + BO + dec: the re-rate reconciles only 54→32 (11 decs) and the
    // untouched inc/BO leave Σ broken (54+20−8−22 = 44 ≠ 32) → the gate
    // FAILS and the sheet is withheld. Pinned as the current honest contract;
    // cap-sleeve-aware re-rate is an engine TODO (plan log).
    const { sheet, validation } = applyIntent(
      flatSetInLike(),
      req('sleeve_length_change', { kind: 'sleeve_length', deltaIn: -1.5 }, 1),
      profile(),
    );
    expect(sheet.steps[0]?.instruction).toContain('every 10 ×1 + every 11 ×10');
    expect(validation.pass).toBe(false);
    expect(
      validation.sumChecks.some((s) => s.path === 'sections[sleeve]' && !s.ok),
    ).toBe(true);
  });

  it('FS4 — KNOWN LIMITATION: body-length intent on flat back+front pair throws (engine TODO)', () => {
    expect(() =>
      applyIntent(
        flatSetInLike(),
        req('body_length_change', { kind: 'body_length', deltaIn: 2 }),
        profile(),
      ),
    ).toThrowError(/no body section found/);
  });
});
