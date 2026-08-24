/**
 * Size & ease selection — VK five-tier bust ease (KB §2, verified C7) +
 * Herzog upper-torso tiers (KB §19.1).
 */

export type VkEaseTier = 'very_close' | 'close' | 'classic' | 'loose' | 'oversized';
export type HerzogEaseTier = 'fitted' | 'average' | 'oversized';

/** VK bust-based tiers, inches relative to bust [KB §2, VK p.158 verified 2026-08-24]. */
export const VK_BUST_EASE_TIERS: Record<VkEaseTier, { min: number; max: number }> = {
  very_close: { min: -4, max: -2 },
  close: { min: -2, max: 0 },
  classic: { min: 2, max: 4 },
  loose: { min: 4, max: 6 },
  oversized: { min: 6, max: Infinity },
};

/** Herzog upper-torso tiers, inches of ease at the UPPER TORSO [KB §19.1]. */
export const UPPER_TORSO_EASE_TIERS: Record<HerzogEaseTier, { min: number; max: number }> = {
  fitted: { min: 0, max: 0 },
  average: { min: 1, max: 2 },
  oversized: { min: 3, max: 4 },
};

export interface SizeRecommendation {
  sizeIndex: number;
  finishedBustIn: number;
  /** Actual ease at the upper torso if this size is chosen. */
  upperTorsoEaseIn: number;
}

/**
 * Herzog sizing [§19.1]: choose the base size by UPPER TORSO + ease, never by full bust.
 * `finishedBustsIn` = the pattern's per-size finished bust circumferences (schematic values).
 * Returns the nearest size; ties resolve to the smaller size (easier to add darts than remove width).
 */
export function recommendSizeByUpperTorso(
  upperTorsoIn: number,
  targetEaseIn: number,
  finishedBustsIn: number[],
): SizeRecommendation {
  if (finishedBustsIn.length === 0) throw new Error('no sizes provided');
  const target = upperTorsoIn + targetEaseIn;
  let best = 0;
  let bestDist = Infinity;
  for (const [i, bust] of finishedBustsIn.entries()) {
    const dist = Math.abs(bust - target);
    // ties resolve to the smaller size: strict < keeps the earlier (smaller) index
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  const chosen = finishedBustsIn[best]!;
  return {
    sizeIndex: best,
    finishedBustIn: chosen,
    upperTorsoEaseIn: round2(chosen - upperTorsoIn),
  };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
