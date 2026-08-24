import type {
  GaugeBlock,
  Pattern,
  Section,
  ShapingEvent,
} from './index.js';

export interface Diagnostic {
  level: 'error' | 'warning';
  code: string;
  message: string;
  path: string;
}

/**
 * Validation contract from specs/pattern_schema.md §5:
 * 1. all per-size arrays have length sizeCount
 * 2. every section: start/end checkpoints; Σ events reconcile exactly
 * 3. schedules: interval rows × times ≤ section length
 * 6. construction.type ∈ enum; stitchPattern refs resolve
 */
export function validatePattern(pattern: Pattern): Diagnostic[] {
  const diags: Diagnostic[] = [];
  const n = pattern.sizing.sizeCount;

  const checkArr = (arr: number[] | undefined, path: string): void => {
    if (arr !== undefined && arr.length !== n) {
      diags.push({
        level: 'error',
        code: 'SIZE_ARRAY_LENGTH',
        message: `array length ${arr.length} != sizeCount ${n}`,
        path,
      });
    }
  };

  checkArr(pattern.sizing.bustOrChestIn, 'sizing.bustOrChestIn');
  if (pattern.sizing.labels.length !== n) {
    diags.push({
      level: 'error',
      code: 'SIZE_ARRAY_LENGTH',
      message: `labels length ${pattern.sizing.labels.length} != sizeCount ${n}`,
      path: 'sizing.labels',
    });
  }

  for (const g of pattern.gauge) checkGauge(g, diags);

  const spIds = new Set(pattern.stitchPatterns.map((s) => s.id));
  for (const sec of pattern.sections) {
    validateSection(sec, n, checkArr, diags);
    for (const ev of sec.events) {
      if (ev.stitchPatternRef && ev.stitchPatternRef !== 'stockinette'
          && !spIds.has(ev.stitchPatternRef)) {
        diags.push({
          level: 'error',
          code: 'UNRESOLVED_STITCH_PATTERN',
          message: `unknown stitch pattern "${ev.stitchPatternRef}"`,
          path: `sections[${sec.id}].events`,
        });
      }
    }
  }

  if (pattern.schematic.length === 0) {
    diags.push({
      level: 'warning',
      code: 'NO_SCHEMATIC',
      message: 'no schematic dimensions — validation loop (spec 5) cannot run; engine degrades to advisory mode',
      path: 'schematic',
    });
  }

  return diags;
}

function checkGauge(g: GaugeBlock, diags: Diagnostic[]): void {
  if (g.overIn <= 0 || g.stsOver <= 0 || g.stsPerIn <= 0) {
    diags.push({ level: 'error', code: 'BAD_GAUGE', message: 'non-positive gauge values', path: 'gauge' });
    return;
  }
  const implied = g.stsOver / g.overIn;
  if (Math.abs(implied - g.stsPerIn) > 0.05) {
    diags.push({
      level: 'error',
      code: 'GAUGE_NORMALIZATION_MISMATCH',
      message: `stsPerIn ${g.stsPerIn} != stsOver/overIn ${implied.toFixed(3)}`,
      path: 'gauge',
    });
  }
}

function validateSection(
  sec: Section,
  _n: number,
  checkArr: (arr: number[] | undefined, path: string) => void,
  diags: Diagnostic[],
): void {
  checkArr(sec.startsWith.sts, `sections[${sec.id}].startsWith.sts`);
  if (sec.endsAt.sts !== undefined) {
    checkArr(sec.endsAt.sts, `sections[${sec.id}].endsAt.sts`);
  }

  // Σ events per size must reconcile checkpoints exactly (rule 2).
  const start = sec.startsWith.sts;
  const end = sec.endsAt.sts;
  if (end !== undefined) {
    for (let i = 0; i < start.length; i++) {
      const s0 = start[i]!;
      const s1 = end[i]!;
      let delta = 0;
      for (const ev of sec.events) delta += stitchDelta(ev, i);
      if (s0 + delta !== s1) {
        diags.push({
          level: 'error',
          code: 'SUM_CHECK_FAILED',
          message: `size index ${i}: start ${s0} + Σevents ${delta} != end ${s1}`,
          path: `sections[${sec.id}]`,
        });
      }
    }
  }

  // Schedules must fit the section span (rule 3).
  for (const [ei, ev] of sec.events.entries()) {
    const sch = ev.schedule;
    if (!sch) continue;
    for (let i = 0; i < start.length; i++) {
      const rows = sch.intervalRows[i] ?? 0;
      const times = sch.times[i] ?? 0;
      const vRows = sch.variantRows?.[i] ?? 0;
      const vTimes = sch.variantTimes?.[i] ?? 0;
      const consumed = rows * times + vRows * vTimes;
      const span = sec.length?.rows?.[i] ?? Infinity;
      if (consumed > span) {
        diags.push({
          level: 'error',
          code: 'SCHEDULE_EXCEEDS_SPAN',
          message: `event ${ei}: schedule consumes ${consumed} rows > section span ${span}`,
          path: `sections[${sec.id}].events[${ei}]`,
        });
      }
    }
  }
}

/** Stitch delta of one event for size index i (both sides, both interval variants). */
export function stitchDelta(ev: ShapingEvent, sizeIndex: number): number {
  const perSide = ev.perSideSts[sizeIndex] ?? 0;
  const times = ev.schedule?.times[sizeIndex] ?? 1;
  const vTimes = ev.schedule?.variantTimes?.[sizeIndex] ?? 0;
  const sides = 2; // events at "each end/side" hit both sides by convention
  const sign = ev.type === 'inc' || ev.type === 'cast_on' ? 1 : -1;
  switch (ev.type) {
    case 'inc':
    case 'dec':
    case 'bind_off':
    case 'cast_on':
      return sign * perSide * sides * (times + vTimes);
    default:
      return 0; // short_row, markers, divide/join, steek_plan, pickup: no net stitch change
  }
}
