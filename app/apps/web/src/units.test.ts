import { describe, expect, it } from 'vitest';
import { fromCanonicalInches, toCanonicalInches } from './units.js';

describe('web units boundary (canonical inches, one exact conversion each way)', () => {
  it('cm input → canonical inches (round 2)', () => {
    expect(toCanonicalInches(90, 'cm')).toBe(35.43); // 35.433…
    expect(toCanonicalInches(96, 'cm')).toBe(37.8);
    expect(toCanonicalInches(5, 'cm')).toBe(1.97);
  });

  it('inch input passes through untouched', () => {
    expect(toCanonicalInches(36.5, 'in')).toBe(36.5);
  });

  it('canonical inches → cm display value at 1 dp', () => {
    expect(fromCanonicalInches(36.5, 'cm')).toBe(92.7); // 92.71
    expect(fromCanonicalInches(19.5, 'cm')).toBe(49.5);
    expect(fromCanonicalInches(40, 'in')).toBe(40);
  });

  it('round-trip: cm typed → canonical → displayed (1 dp)', () => {
    const canonical = toCanonicalInches(92.7, 'cm'); // 36.5
    expect(fromCanonicalInches(canonical, 'cm')).toBe(92.7);
  });
});
