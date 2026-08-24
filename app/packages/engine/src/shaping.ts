/**
 * Even-interval shaping distribution — KB §7 / §9.
 * Guarantee: Σ(rows) = span exactly; Σ(times) = events exactly;
 * intervals differ by at most 1 (the N/N+1 split).
 */

export interface IntervalGroup {
  /** rows/rounds between events */
  interval: number;
  times: number;
}

export interface ShapingSplit {
  groups: IntervalGroup[];
  totalRows: number;
  totalEvents: number;
}

/**
 * Distribute `events` shaping events over `spanRows` rows.
 * KB §9 worked example: 8 incs over 75 rows → every 9 rows ×5 + every 10 rows ×3 (45+30=75).
 * Throws if events > span (cannot fit; caller must change the design), or on non-positive input.
 */
export function evenIntervalSplit(events: number, spanRows: number): ShapingSplit {
  if (events <= 0) throw new Error('events must be positive');
  if (spanRows <= 0) throw new Error('spanRows must be positive');
  if (events > spanRows) {
    throw new Error(
      `cannot fit ${events} events in ${spanRows} rows: each event needs ≥1 row (KB §7)`,
    );
  }
  const q = Math.floor(spanRows / events);
  const r = spanRows - q * events; // r events get interval q+1
  const groups: IntervalGroup[] = [];
  if (events - r > 0) groups.push({ interval: q, times: events - r });
  if (r > 0) groups.push({ interval: q + 1, times: r });
  return { groups, totalRows: q * events + r, totalEvents: events };
}

/** Σ-check helper: rows consumed by a split. */
export function sumRows(split: ShapingSplit): number {
  return split.groups.reduce((acc, g) => acc + g.interval * g.times, 0);
}

/** Σ-check helper: events in a split. */
export function sumEvents(split: ShapingSplit): number {
  return split.groups.reduce((acc, g) => acc + g.times, 0);
}

/**
 * Sleeve/section re-rate (Budd-TD §16.2): taper from upper-arm sts to cuff sts
 * over the available rows. Decs are 2 sts per dec round (one each side).
 * Returns the schedule for the DEC ROUNDS plus the Σ verification.
 */
export function taperSchedule(
  upperArmSts: number,
  cuffSts: number,
  availableRows: number,
): ShapingSplit & { decRounds: number; verify: boolean } {
  const totalDecSts = upperArmSts - cuffSts;
  if (totalDecSts < 0) throw new Error('cuff wider than upper arm — use increases instead');
  if (totalDecSts % 2 !== 0) {
    throw new Error(
      `stitch difference ${totalDecSts} is odd — adjust a checkpoint by 1 st (Σ must be exact)`,
    );
  }
  const decRounds = totalDecSts / 2;
  const split = evenIntervalSplit(decRounds, availableRows);
  return { ...split, decRounds, verify: sumRows(split) === availableRows && sumEvents(split) === decRounds };
}
