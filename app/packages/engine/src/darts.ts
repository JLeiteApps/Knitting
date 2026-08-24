/**
 * Bust accommodation — Herzog §19.3/§19.4 (KB §10).
 * All amounts in inches; converts to stitches/rows only via explicit gauge args.
 */

export type FitTightness = 'tight' | 'average' | 'loose';

/** Inches subtracted from the measured difference — tighter sweaters subtract LESS
 *  (need more shaping); looser subtract more (ease absorbs the difference) [Herzog §19.3]. */
const VERTICAL_SUBTRACTION: Record<FitTightness, number> = {
  tight: 1,
  average: 1.5,
  loose: 2,
};

/** Short-row stretch allowance [Herzog §19.4: "approximately 2\"", adjusted by tightness]. */
const SHORTROW_SUBTRACTION: Record<FitTightness, number> = {
  tight: 1,
  average: 2,
  loose: 3,
};

export interface VerticalDartResult {
  /** Total extra front circumference, inches (0 when no dart needed). */
  dartWidthIn: number;
  /** Stitches to add per front half at the given stitch gauge (paired dart incs). */
  perSideSts: number;
  /** Where the surplus is removed [Herzog: at the NECK edge after the bust]. */
  removal: 'neck_edge';
}

/**
 * Vertical (width) dart amount [Herzog §19.3]:
 * dart = full_bust − upper_torso − adjustment; clamped at 0.
 */
export function verticalDart(
  fullBustIn: number,
  upperTorsoIn: number,
  tightness: FitTightness,
  stsPerIn: number,
): VerticalDartResult {
  const dartWidthIn = Math.max(0, fullBustIn - upperTorsoIn - VERTICAL_SUBTRACTION[tightness]);
  return {
    dartWidthIn,
    perSideSts: Math.round((dartWidthIn * stsPerIn) / 2),
    removal: 'neck_edge',
  };
}

/**
 * Bust + belly variant [Herzog §19.3]: extra front cast-on width from
 * front-vs-back mid-hip width difference − 1".
 */
export function frontBellyWidth(frontMidHipIn: number, backMidHipIn: number): number {
  return Math.max(0, frontMidHipIn - backMidHipIn - 1);
}

export interface ShortRowAmountResult {
  /** Wedge depth needed over the bust, inches (0 when none). */
  amountIn: number;
  /** Rows to work, rounded DOWN to even (short rows come in pairs) [Herzog §19.4]. */
  rows: number;
  pairs: number;
}

/** Short-row dart amount [Herzog §19.4]: (front − back hem-to-shoulder) − stretch allowance. */
export function shortRowDartAmount(
  frontHemToShoulderIn: number,
  backHemToShoulderIn: number,
  tightness: FitTightness,
  rowsPerIn: number,
): ShortRowAmountResult {
  const amountIn = Math.max(
    0,
    frontHemToShoulderIn - backHemToShoulderIn - SHORTROW_SUBTRACTION[tightness],
  );
  const rawRows = amountIn * rowsPerIn;
  const rows = Math.floor(rawRows / 2) * 2;
  return { amountIn, rows, pairs: rows / 2 };
}

export interface ShortRowPlacement {
  /** Work the wedge UNDER the fullest part of the bust [Herzog]. */
  region: 'under_fullest_part';
  /** Start when the piece measures hemToArmhole − 2". */
  startAtIn: number;
  /** Dart must FINISH this far before armhole shaping (bust widest ≈ armhole start). */
  finishBeforeArmholeMinIn: 1;
  finishBeforeArmholeMaxIn: 2;
  /** Shortest pair ≈ 2" wider than apex-to-apex span. */
  shortestPairSpanIn: (apexToApexIn: number) => number;
  /** Longest pair reaches ~½" from each side seam. */
  longestPairFromSideSeamIn: 0.5;
}

export function shortRowPlacement(hemToArmholeIn: number): ShortRowPlacement {
  return {
    region: 'under_fullest_part',
    startAtIn: hemToArmholeIn - 2,
    finishBeforeArmholeMinIn: 1,
    finishBeforeArmholeMaxIn: 2,
    shortestPairSpanIn: (apexToApexIn) => apexToApexIn + 2,
    longestPairFromSideSeamIn: 0.5,
  };
}

/**
 * Negative-ease length compensation [Herzog §19.5]:
 * add ⅔" of body length per 1" of bust negative ease.
 */
export function negativeEaseLengthCompensation(bustNegativeEaseIn: number): number {
  return Math.max(0, bustNegativeEaseIn) * (2 / 3);
}
