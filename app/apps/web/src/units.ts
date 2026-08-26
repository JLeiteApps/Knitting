/**
 * Web unit helpers — display + input conversion at the UI boundary.
 * Engine stays canonical inches (policy A2); these convert exactly once.
 */
import { cmToIn, fmtLen, inToCm } from '@knitting/engine';
import type { DisplayUnit } from '@knitting/engine';

export { cmToIn, inToCm, fmtLen };
export type { DisplayUnit };

/** Canonical inches from a value typed in the active display unit. */
export function toCanonicalInches(value: number, unit: DisplayUnit): number {
  const inches = unit === 'cm' ? cmToIn(value) : value;
  return Math.round(inches * 100) / 100;
}

/** Display-unit value from canonical inches (cm at 1 dp for clean forms). */
export function fromCanonicalInches(inches: number, unit: DisplayUnit): number {
  return unit === 'cm' ? Math.round(inToCm(inches) * 10) / 10 : inches;
}

/** Unit suffix for compact labels: "" / " cm" (inch strings carry `"` via fmtLen). */
export const UNIT_LABEL: Record<DisplayUnit, string> = {
  in: 'in',
  cm: 'cm',
};
