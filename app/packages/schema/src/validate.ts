import type {
  ConstructionType,
  GaugeBlock,
  Pattern,
  Section,
  ShapingEvent,
} from './index.js';

const CONSTRUCTION_TYPES: ReadonlySet<string> = new Set<ConstructionType>([
  'unknown',
  'flat_drop_shoulder', 'flat_set_in', 'flat_raglan', 'flat_saddle', 'steeked_cardigan',
  'eps_yoke', 'eps_raglan', 'eps_hybrid', 'kangaroo_cut_armhole', 'top_down_raglan',
  'top_down_yoke', 'bottom_up_yoke', 'top_down_set_in', 'contiguous_simultaneous_set_in',
  'top_down_saddle', 'dolman_kimono', 'square_set', 'top_down_drop_shoulder',
  'modified_drop_shoulder', 'accessory_hat', 'accessory_sock', 'accessory_mitten',
  'accessory_glove', 'accessory_scarf', 'accessory_tam',
]);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Runtime boundary for imported JSON. */
export function validatePatternUnknown(value: unknown): Diagnostic[] {
  if (!isObj(value)) return [{ level: 'error', code: 'PATTERN_NOT_OBJECT', message: 'pattern must be an object', path: '' }];
  if (value.schemaVersion !== '0.1') return [{ level: 'error', code: 'SCHEMA_VERSION', message: 'unsupported pattern schema version', path: 'schemaVersion' }];
  const p = value as unknown as Partial<Pattern>;
  if (!isObj(p.meta) || typeof p.meta.name !== 'string' || p.meta.name.trim() === '') return [{ level: 'error', code: 'META_INVALID', message: 'pattern name is required', path: 'meta.name' }];
  if (!isObj(p.sizing) || !Array.isArray(p.sizing.labels) || !Number.isInteger(p.sizing.sizeCount) || p.sizing.sizeCount <= 0 || !Array.isArray(p.sizing.bustOrChestIn)) return [{ level: 'error', code: 'SIZING_INVALID', message: 'sizing labels, sizeCount and bustOrChestIn are required', path: 'sizing' }];
  if (!Array.isArray(p.gauge) || !isObj(p.construction) || !Array.isArray(p.schematic) || !Array.isArray(p.stitchPatterns) || !Array.isArray(p.sections)) return [{ level: 'error', code: 'PATTERN_SHAPE', message: 'pattern arrays and construction are required', path: '' }];
  return validatePattern(p as Pattern);
}

export function isPattern(value: unknown): value is Pattern {
  return validatePatternUnknown(value).every((d) => d.level !== 'error');
}

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
  try {
  if (!isObj(pattern)) return [{ level: 'error', code: 'PATTERN_NOT_OBJECT', message: 'pattern must be an object', path: '' }];
  const n = pattern.sizing.sizeCount;

  const checkArr = (arr: number[] | undefined, path: string, positive = false, integers = false): void => {
    if (arr !== undefined && arr.length !== n) {
      diags.push({
        level: 'error',
        code: 'SIZE_ARRAY_LENGTH',
        message: `array length ${arr.length} != sizeCount ${n}`,
        path,
      });
    }
    for (const [i, v] of (arr ?? []).entries()) {
      if (!finite(v) || (positive && v <= 0) || (integers && !Number.isInteger(v))) {
        diags.push({ level: 'error', code: 'NON_FINITE_NUMBER', message: 'value must be finite and within its allowed domain', path: `${path}[${i}]` });
      }
    }
  };

  if (!Number.isInteger(n) || n <= 0) diags.push({ level: 'error', code: 'BAD_SIZE_COUNT', message: 'sizeCount must be a positive integer', path: 'sizing.sizeCount' });
  if (!Array.isArray(pattern.sizing.labels) || pattern.sizing.labels.some((x) => typeof x !== 'string' || x.trim() === '')) diags.push({ level: 'error', code: 'LABEL_INVALID', message: 'every size label must be a non-empty string', path: 'sizing.labels' });
  if (!['to_fit', 'finished', 'unknown'].includes(pattern.sizing.measurementBasis)) diags.push({ level: 'error', code: 'MEASUREMENT_BASIS', message: 'measurementBasis is invalid', path: 'sizing.measurementBasis' });

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
  if (!CONSTRUCTION_TYPES.has(pattern.construction.type)) diags.push({ level: 'error', code: 'CONSTRUCTION_INVALID', message: `unknown construction type "${String(pattern.construction.type)}"`, path: 'construction.type' });
  if (pattern.construction.direction !== 'top_down' && pattern.construction.direction !== 'bottom_up') diags.push({ level: 'error', code: 'CONSTRUCTION_DIRECTION', message: 'construction direction is invalid', path: 'construction.direction' });
  if (pattern.construction.type === 'unknown') diags.push({ level: 'error', code: 'CONSTRUCTION_UNVERIFIED', message: 'construction family is unknown; review and choose a supported family before accepting', path: 'construction.type' });
  if (!Array.isArray(pattern.construction.working)) {
    diags.push({ level: 'error', code: 'CONSTRUCTION_WORKING_INVALID', message: 'construction working-method entries are required', path: 'construction.working' });
  } else {
    for (const [i, work] of pattern.construction.working.entries()) {
      if (!isObj(work)) {
        diags.push({ level: 'error', code: 'WORKING_METHOD_INVALID', message: 'construction working-method entry must be an object', path: `construction.working[${i}]` });
      } else if (work.method === 'unknown') {
        diags.push({ level: 'error', code: 'WORKING_METHOD_UNKNOWN', message: 'construction working method is unknown; review the pattern before accepting', path: `construction.working[${i}].method` });
      } else if (work.method !== 'flat' && work.method !== 'in_the_round') {
        diags.push({ level: 'error', code: 'WORKING_METHOD_INVALID', message: 'construction working method must be flat, in_the_round, or unknown', path: `construction.working[${i}].method` });
      }
    }
  }

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

  for (const [i, dim] of pattern.schematic.entries()) {
    checkArr(dim.in, `schematic[${i}].in`, true);
  }
  if (pattern.schematic.length === 0) {
    diags.push({
      level: 'warning',
      code: 'NO_SCHEMATIC',
      message: 'no schematic dimensions — validation loop (spec 5) cannot run; engine degrades to advisory mode',
      path: 'schematic',
    });
  }

  } catch {
    diags.push({ level: 'error', code: 'PATTERN_MALFORMED', message: 'pattern contains malformed nested data', path: '' });
  }
  return diags;
}

function checkGauge(g: GaugeBlock, diags: Diagnostic[]): void {
  if (g.worked === 'unknown') {
    diags.push({ level: 'error', code: 'WORKING_METHOD_UNKNOWN', message: 'gauge working method is unknown; review the pattern before accepting', path: 'gauge.worked' });
  } else if (g.worked !== 'flat' && g.worked !== 'in_the_round') {
    diags.push({ level: 'error', code: 'WORKING_METHOD_INVALID', message: 'gauge working method must be flat, in_the_round, or unknown', path: 'gauge.worked' });
  }
  if (!finite(g.overIn) || !finite(g.stsOver) || !finite(g.stsPerIn) || g.overIn <= 0 || g.stsOver <= 0 || g.stsPerIn <= 0) {
    diags.push({ level: 'error', code: 'BAD_GAUGE', message: 'non-positive gauge values', path: 'gauge' });
    return;
  }
  if (g.rowsOver !== null && (!finite(g.rowsOver) || g.rowsOver <= 0)) diags.push({ level: 'error', code: 'BAD_GAUGE', message: 'rowsOver must be null or positive', path: 'gauge.rowsOver' });
  if (g.rowsPerIn !== null && (!finite(g.rowsPerIn) || g.rowsPerIn <= 0)) diags.push({ level: 'error', code: 'BAD_GAUGE', message: 'rowsPerIn must be null or positive', path: 'gauge.rowsPerIn' });
  if (g.rowsOver !== null && g.rowsPerIn !== null && Math.abs(g.rowsOver / g.overIn - g.rowsPerIn) > 0.05) {
    diags.push({ level: 'error', code: 'GAUGE_NORMALIZATION_MISMATCH', message: `rowsPerIn ${g.rowsPerIn} != rowsOver/overIn ${(g.rowsOver / g.overIn).toFixed(3)}`, path: 'gauge.rowsPerIn' });
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
  n: number,
  checkArr: (arr: number[] | undefined, path: string, positive?: boolean, integers?: boolean) => void,
  diags: Diagnostic[],
): void {
  if (!Array.isArray(sec.startsWith?.sts) || sec.startsWith.sts.length === 0) {
    diags.push({ level: 'error', code: 'MISSING_START_CHECKPOINT', message: 'section needs a starting stitch checkpoint before it can be verified', path: `sections[${sec.id}].startsWith.sts` });
  }
  checkArr(sec.startsWith.sts, `sections[${sec.id}].startsWith.sts`, true, true);
  if (sec.endsAt.sts !== undefined) {
    // A fully shaped/closed piece may legitimately end at zero stitches;
    // retain integer and finite checks while rejecting negative counts.
    checkArr(sec.endsAt.sts, `sections[${sec.id}].endsAt.sts`, false, true);
  }
  if (sec.method === 'unknown') {
    diags.push({ level: 'error', code: 'SECTION_METHOD_UNKNOWN', message: 'section working method is unknown; review the pattern before accepting', path: `sections[${sec.id}].method` });
  } else if (sec.method !== 'flat' && sec.method !== 'in_the_round') {
    diags.push({ level: 'error', code: 'SECTION_METHOD_INVALID', message: 'section working method must be flat, in_the_round, or unknown', path: `sections[${sec.id}].method` });
  }
  if (sec.length?.rows !== undefined) checkArr(sec.length.rows, `sections[${sec.id}].length.rows`, true, true);
  if (sec.length?.in !== undefined) checkArr(sec.length.in, `sections[${sec.id}].length.in`, true);

  // Σ events per size must reconcile checkpoints exactly (rule 2).
  const start = sec.startsWith.sts;
  const end = sec.endsAt.sts;
  if (end !== undefined) {
    for (let i = 0; i < Math.min(n, start.length, end.length); i++) {
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
    if (!['inc', 'dec', 'bind_off', 'cast_on', 'short_row', 'place_marker', 'divide', 'join', 'steek_plan', 'pickup'].includes(ev.type)) {
      diags.push({ level: 'error', code: 'EVENT_TYPE_INVALID', message: `unknown event type "${String(ev.type)}"`, path: `sections[${sec.id}].events[${ei}].type` });
    }
    if (!Array.isArray(ev.perSideSts)) {
      diags.push({ level: 'error', code: 'EVENT_INVALID', message: 'event perSideSts must be an array', path: `sections[${sec.id}].events[${ei}]` });
      continue;
    }
    checkArr(ev.perSideSts, `sections[${sec.id}].events[${ei}].perSideSts`, false, true);
    if (ev.perSideSts.some((v) => !finite(v) || v < 0)) {
      diags.push({ level: 'error', code: 'NEGATIVE_COUNT', message: 'event stitch counts cannot be negative', path: `sections[${sec.id}].events[${ei}].perSideSts` });
    }
    const sch = ev.schedule;
    if (!sch) continue;
    checkArr(sch.intervalRows, `sections[${sec.id}].events[${ei}].schedule.intervalRows`, false, true);
    checkArr(sch.times, `sections[${sec.id}].events[${ei}].schedule.times`, false, true);
    if (sch.variantRows !== undefined) checkArr(sch.variantRows, `sections[${sec.id}].events[${ei}].schedule.variantRows`, false, true);
    if (sch.variantTimes !== undefined) checkArr(sch.variantTimes, `sections[${sec.id}].events[${ei}].schedule.variantTimes`, false, true);
    const scheduleArrays = [sch.intervalRows, sch.times, sch.variantRows ?? [], sch.variantTimes ?? []];
    if (scheduleArrays.some((arr) => arr.some((v) => !finite(v) || v < 0))) {
      diags.push({ level: 'error', code: 'BAD_SCHEDULE', message: 'schedule counts cannot be negative', path: `sections[${sec.id}].events[${ei}].schedule` });
    }
    for (let i = 0; i < start.length; i++) {
      const rows = sch.intervalRows[i] ?? 0;
      const times = sch.times[i] ?? 0;
      const vRows = sch.variantRows?.[i] ?? 0;
      const vTimes = sch.variantTimes?.[i] ?? 0;
      const consumed = rows * times + vRows * vTimes;
      if ((times > 0 && rows <= 0) || (vTimes > 0 && vRows <= 0)) {
        diags.push({ level: 'error', code: 'BAD_SCHEDULE', message: 'scheduled events need positive intervals', path: `sections[${sec.id}].events[${ei}].schedule` });
      }
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
