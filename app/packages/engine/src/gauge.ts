/**
 * Gauge math — KB §2 / §6. Pure functions, inches canonical.
 */

/** Convert a stitch count between gauges preserving finished width (§2).
 *  Width-preserving direction: count × (toGauge / fromGauge) — knitting MORE sts/in
 *  (smaller stitches) requires MORE stitches for the same width.
 *  (Dimensional check: 200 sts @ 5 sts/in = 40"; at 5.5 sts/in you need 220.) */
export function convertCount(
  count: number,
  fromStsPerIn: number,
  toStsPerIn: number,
): number {
  if (fromStsPerIn <= 0 || toStsPerIn <= 0) throw new Error('gauges must be positive');
  return Math.round((count * toStsPerIn) / fromStsPerIn);
}

/** Tier-1 rounding (A5): absolute counts round to nearest st, then to a repeat multiple. */
export function roundToRepeat(count: number, multiple: number): number {
  if (multiple <= 0) throw new Error('multiple must be positive');
  const m = Math.max(1, Math.round(multiple));
  return Math.max(m, Math.round(count / m) * m);
}

/** Finished width of a stitch count at a gauge. */
export function widthIn(count: number, stsPerIn: number): number {
  return count / stsPerIn;
}

/** Dimensional drift between a rounded count and the exact target width (§2 "report the drift"). */
export function driftIn(targetWidthIn: number, actualCount: number, stsPerIn: number): number {
  return Math.abs(targetWidthIn - widthIn(actualCount, stsPerIn));
}

/** Row-count conversion between row gauges (§2), same width-preserving orientation:
 *  rows × (toGauge / fromGauge). */
export function convertRows(rows: number, fromRowsPerIn: number, toRowsPerIn: number): number {
  if (fromRowsPerIn <= 0 || toRowsPerIn <= 0) throw new Error('row gauges must be positive');
  return Math.round((rows * toRowsPerIn) / fromRowsPerIn);
}

/**
 * Row-gauge-mismatch drift, KB §17.2 step 0:
 * drift(L) = |L × (new_rg / old_rg − 1)|
 */
export function rowGaugeDrift(lengthIn: number, oldRowsPerIn: number, newRowsPerIn: number): number {
  return Math.abs(lengthIn * (newRowsPerIn / oldRowsPerIn - 1));
}

/** §17.2 action threshold [policy, anchored to Phase-5 QA bound]. */
export const ROW_GAUGE_ACTION_THRESHOLD_IN = 0.25;
