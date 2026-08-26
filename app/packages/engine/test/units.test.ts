import { describe, expect, it } from 'vitest';
import { cmToIn, fmtLen, inToCm } from '../src/units.js';

describe('units (policy A2: canonical inches, cm only at boundaries)', () => {
  it('conversions are exact inverses', () => {
    expect(inToCm(1)).toBe(2.54);
    expect(cmToIn(2.54)).toBe(1);
    expect(cmToIn(inToCm(19.5))).toBeCloseTo(19.5, 12);
  });

  it('inch mode is byte-compatible with the legacy strings', () => {
    expect(fmtLen(19.5, 'in')).toBe('19.5"');
    expect(fmtLen(2, 'in', { digits: 2 })).toBe('2.00"'); // legacy toFixed(2) sites
    expect(fmtLen(0.25, 'in')).toBe('0.25"');
    expect(fmtLen(17.145, 'in')).toBe('17.15"'); // round2 half-up
  });

  it('cm mode: exact ×2.54, one decimal, trailing zeros trimmed', () => {
    expect(fmtLen(19.5, 'cm')).toBe('49.5 cm'); // 49.53 → 49.5
    expect(fmtLen(2, 'cm')).toBe('5.1 cm'); // 5.08
    expect(fmtLen(40, 'cm')).toBe('101.6 cm'); // 101.6 exactly
    expect(fmtLen(0.5, 'cm')).toBe('1.3 cm'); // 1.27
  });
});
