/**
 * Unit helpers — policy A2: inches are canonical internally; cm exists only
 * at the boundaries (input conversion + display formatting). Conversions are
 * exact (×2.54 / ÷2.54); rounding happens once, at display time.
 */
export type DisplayUnit = 'in' | 'cm';

const CM_PER_IN = 2.54;

export function inToCm(inches: number): number {
  return inches * CM_PER_IN;
}

export function cmToIn(cm: number): number {
  return cm / CM_PER_IN;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Format a length for human-facing engine text.
 * - inch mode: byte-compatible with the legacy template strings — the value
 *   is rounded to 2 dp and suffixed with `"` (use `digits: 2` where the
 *   legacy string used toFixed(2), e.g. dart widths `2.00"`).
 * - cm mode: exact ×2.54, rounded to 1 dp, trailing zeros trimmed, ` cm`.
 */
export function fmtLen(inches: number, unit: DisplayUnit, opts?: { digits?: number }): string {
  if (unit === 'cm') {
    const cm = Math.round(inToCm(inches) * 10) / 10;
    return `${cm} cm`;
  }
  if (opts?.digits === 2) return `${inches.toFixed(2)}"`;
  return `${round2(inches)}"`;
}
