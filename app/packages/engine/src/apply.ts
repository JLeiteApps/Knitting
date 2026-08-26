/**
 * Modification applier — runs the 5 MVP intents over a Pattern IR
 * (specs/intent_grammar.md §2). Deterministic: same inputs → same outputs,
 * every change Σ-verified and reported in the validation gate.
 */
import type { Pattern, Section, ShapingEvent } from '@knitting/schema';
import {
  convertCount,
  convertRows,
  rowGaugeDrift,
  ROW_GAUGE_ACTION_THRESHOLD_IN,
} from './gauge.js';
import { sumEvents, sumRows, taperSchedule } from './shaping.js';
import {
  negativeEaseLengthCompensation,
  shortRowDartAmount,
  shortRowPlacement,
  verticalDart,
} from './darts.js';
import { recommendSizeByUpperTorso, UPPER_TORSO_EASE_TIERS } from './ease.js';
import { fmtLen, type DisplayUnit } from './units.js';
import type {
  DimensionCheck,
  FitProfile,
  ModificationRequest,
  ModificationSheet,
  SheetStep,
  SumCheck,
  Tightness,
  ValidationReport,
} from '@knitting/shared';

const TIER_EASE: Record<string, number> = {
  fitted: UPPER_TORSO_EASE_TIERS.fitted.min,
  average: (UPPER_TORSO_EASE_TIERS.average.min + UPPER_TORSO_EASE_TIERS.average.max) / 2,
  oversized: (UPPER_TORSO_EASE_TIERS.oversized.min + UPPER_TORSO_EASE_TIERS.oversized.max) / 2,
};

export function applyIntent(
  pattern: Pattern,
  request: ModificationRequest,
  profile: FitProfile,
  opts?: { unit?: DisplayUnit },
): { sheet: ModificationSheet; validation: ValidationReport; modified: Pattern } {
  const sizeIndex = request.sizeIndex ?? 0;
  const unit: DisplayUnit = opts?.unit ?? profile.displayUnit ?? 'in';
  const L = (inches: number, digits?: 2) => fmtLen(inches, unit, digits ? { digits } : undefined);
  const ctx: Ctx = { pattern, request, profile, sizeIndex, L };
  const steps: SheetStep[] = [];
  const warnings: string[] = [];
  let modified: Pattern = structuredClone(pattern);

  switch (request.params.kind) {
    case 'size_ease': {
      const out = applySizeEase(ctx, modified);
      steps.push(...out.steps);
      break;
    }
    case 'gauge': {
      const out = applyGaugeConversion(ctx, modified);
      modified = out.modified;
      steps.push(...out.steps);
      warnings.push(...out.warnings);
      break;
    }
    case 'body_length': {
      const out = applyBodyLength(ctx, modified);
      modified = out.modified;
      steps.push(...out.steps);
      break;
    }
    case 'sleeve_length': {
      const out = applySleeveLength(ctx, modified);
      modified = out.modified;
      steps.push(...out.steps);
      break;
    }
    case 'bust': {
      const out = applyBust(ctx, modified);
      modified = out.modified;
      steps.push(...out.steps);
      warnings.push(...out.warnings);
      break;
    }
  }

  const sheet: ModificationSheet = {
    patternId: pattern.meta.name,
    intent: request.intent,
    sizeIndex,
    steps,
    warnings,
    createdAt: new Date().toISOString(),
  };
  const validation = validateAgainstSchematic(modified, sizeIndex);
  return { sheet, validation, modified };
}

// ── Intent 1: size & ease selection (Herzog §19.1) ─────────────────────────

function applySizeEase(
  ctx: Ctx,
  _modified: Pattern,
): { steps: SheetStep[] } {
  const steps: SheetStep[] = [];
  const p = ctx.request.params;
  if (p.kind !== 'size_ease') throw new Error('unreachable');
  const upperTorso = ctx.profile.upperTorsoIn;
  if (upperTorso === undefined) {
    throw new Error('profile needs upperTorsoIn (Herzog §19.1 measurement) — ask the user');
  }
  const ease = p.targetEaseIn ?? TIER_EASE[p.tier ?? 'average'] ?? 1.5;
  const finishedBusts = ctx.pattern.schematic
    .filter((d) => d.dimension === 'width_at_chest' && d.piece === 'back')
    .flatMap((d) => d.in.map((w) => w * 2));
  const rec = recommendSizeByUpperTorso(upperTorso, ease, finishedBusts.length ? finishedBusts : ctx.pattern.sizing.bustOrChestIn);
  steps.push({
    id: 'size-selection',
    title: `Knit size ${ctx.pattern.sizing.labels[rec.sizeIndex] ?? `#${rec.sizeIndex + 1}`}`,
    instruction: `Choose the size with a ${ctx.L(rec.finishedBustIn)} finished bust (real ease at your upper torso: ${ctx.L(rec.upperTorsoEaseIn)}).`,
    math: [
      `upper torso ${ctx.L(upperTorso)} + target ease ${ctx.L(ease)} = ${ctx.L(upperTorso + ease)}`,
      `nearest finished bust across sizes = ${ctx.L(rec.finishedBustIn)}`,
    ],
    refs: ['Herzog §19.1', 'engine: recommendSizeByUpperTorso'],
  });
  if (ctx.profile.fullBustIn !== undefined) {
    const bustEase = rec.finishedBustIn - ctx.profile.fullBustIn;
    if (bustEase < 0) {
      steps.push({
        id: 'size-bust-note',
        title: 'Bust accommodation advised',
        instruction: `This size gives ${ctx.L(bustEase, 2)} ease at your FULL bust — run "bust accommodation" next.`,
        math: [`finished ${ctx.L(rec.finishedBustIn)} − full bust ${ctx.L(ctx.profile.fullBustIn)} = ${ctx.L(bustEase, 2)}`],
        refs: ['Herzog §19.1–19.2', 'engine: negativeEaseLengthCompensation'],
      });
    }
  }
  return { steps };
}

// ── Intent 5: gauge conversion (KB §2, corrected formula) ───────────────────

function applyGaugeConversion(
  ctx: Ctx,
  modified: Pattern,
): { modified: Pattern; steps: SheetStep[]; warnings: string[] } {
  const p = ctx.request.params;
  if (p.kind !== 'gauge') throw new Error('unreachable');
  const steps: SheetStep[] = [];
  const warnings: string[] = [];
  const from = ctx.pattern.gauge.find((g) => g.primary)?.stsPerIn;
  if (!from) throw new Error('pattern has no primary stitch gauge');
  const fromRows = ctx.pattern.gauge.find((g) => g.primary)?.rowsPerIn ?? null;
  const to = p.userStsPerIn;

  // The converted pattern is knit at the USER's gauge — update the primary
  // gauge block so the validation loop recomputes with the right rate.
  const primary = modified.gauge.find((g) => g.primary)!;
  primary.stsPerIn = to;
  primary.stsOver = Math.round(to * primary.overIn);
  if (p.userRowsPerIn) {
    primary.rowsPerIn = p.userRowsPerIn;
    primary.rowsOver = Math.round(p.userRowsPerIn * primary.overIn);
  }
  primary.raw = `${primary.raw ?? ''} [converted to ${to} sts/in]`;

  for (const sec of modified.sections) {
    sec.startsWith.sts = sec.startsWith.sts.map((s) => convertCount(s, from, to));
    if (sec.endsAt.sts) sec.endsAt.sts = sec.endsAt.sts.map((s) => convertCount(s, from, to));
    for (const ev of sec.events) {
      ev.perSideSts = ev.perSideSts.map((s) => convertCount(s, from, to));
    }
    // KB §6 step 3: after converting checkpoints, RE-DERIVE the shaping — the
    // difference between successive counts is what the incs/decs must sum to.
    rebalanceSection(sec);
    if (sec.length?.rows && p.userRowsPerIn && fromRows) {
      const target = p.userRowsPerIn;
      sec.length.rows = sec.length.rows.map((r) => convertRows(r, fromRows, target));
    }
  }
  // Schematic drift per width dimension is reported by the validation gate below
  // (recomputed schematic vs target, §13.8); count-rounding drift shows up there.
  steps.push({
    id: 'gauge-conversion',
    title: `All counts converted ${from} → ${to} sts/in`,
    instruction: 'Work every count in this sheet instead of the pattern number at the same point.',
    math: [
      `new = old × ${to} / ${from} (width-preserving; KB §2 erratum)`,
      `example: ${convertCount(100, from, to)} sts where the pattern says 100`,
    ],
    refs: ['KB §2/§6', 'engine: convertCount'],
  });
  const rgFrom = modified.gauge.find((g) => g.primary)?.rowsPerIn;
  if (rgFrom && p.userRowsPerIn) {
    const drift = rowGaugeDrift(bodyLengthIn(modified), rgFrom, p.userRowsPerIn);
    warnings.push(
      `Row-gauge drift ${ctx.L(drift, 2)} over the body ${drift >= ROW_GAUGE_ACTION_THRESHOLD_IN
        ? `— EXCEEDS the ${ctx.L(ROW_GAUGE_ACTION_THRESHOLD_IN)} action threshold: prefer work-to-length output (KB §17.2)`
        : `(below the ${ctx.L(ROW_GAUGE_ACTION_THRESHOLD_IN)} action threshold)`}`,
    );
  } else {
    warnings.push('Row gauge missing (pattern or user) — all row-derived output is work-to-length (KB §17.2 step 6).');
  }
  return { modified, steps, warnings };
}

function bodyLengthIn(pattern: Pattern): number {
  const body = pattern.sections.find((s) => s.piece === 'body' || s.piece === 'body_tube');
  return body?.length?.in?.[0] ?? 16;
}

// ── Intent 3: body length (KB §11 hem rule, §17.2 work-to-length) ──────────

function applyBodyLength(
  ctx: Ctx,
  modified: Pattern,
): { modified: Pattern; steps: SheetStep[] } {
  const p = ctx.request.params;
  if (p.kind !== 'body_length') throw new Error('unreachable');
  const body = modified.sections.find((s) => s.piece === 'body' || s.piece === 'body_tube');
  if (!body) throw new Error('no body section found');
  const rowsPerIn = modified.gauge.find((g) => g.primary)?.rowsPerIn;
  const i = ctx.sizeIndex;
  const oldIn = body.length?.in?.[i];
  const newIn = (oldIn ?? bodyLengthIn(modified)) + p.deltaIn;
  const steps: SheetStep[] = [];
  if (body.length?.in) {
    body.length.in = body.length.in.map((v, idx) => (idx === i ? round2(newIn) : v));
  }
  if (body.length?.rows && rowsPerIn) {
    body.length.rows = body.length.rows.map((v, idx) =>
      idx === i ? Math.max(1, Math.round(newIn * rowsPerIn)) : v,
    );
  }
  steps.push({
    id: 'body-length',
    sectionId: body.id,
    title: `Body ${p.deltaIn >= 0 ? 'lengthened' : 'shortened'} by ${ctx.L(Math.abs(p.deltaIn))}`,
    instruction:
      `Work the PLAIN span only (outside any waist shaping): ${rowsPerIn
        ? `add/omit ${Math.abs(Math.round(p.deltaIn * rowsPerIn))} ${body.method === 'in_the_round' ? 'rounds' : 'rows'}, `
        : ''}or simply work until the piece measures ${ctx.L(newIn)}.`,
    math: [
      `old length ${ctx.L(oldIn ?? 0)} ${p.deltaIn >= 0 ? '+' : '−'} ${ctx.L(Math.abs(p.deltaIn))} = ${ctx.L(newIn)}`,
      rowsPerIn ? `${ctx.L(newIn)} × ${rowsPerIn} rows/in = ${Math.round(newIn * rowsPerIn)} rows` : 'no row gauge — work-to-length (KB §17.2)',
    ],
    refs: ['KB §11 hem rule', 'KB §17.2 step 3', 'engine: work-to-length'],
  });
  return { modified, steps };
}

// ── Intent 4: sleeve length (KB §16.2 re-rate) ──────────────────────────────

function applySleeveLength(
  ctx: Ctx,
  modified: Pattern,
): { modified: Pattern; steps: SheetStep[] } {
  const p = ctx.request.params;
  if (p.kind !== 'sleeve_length') throw new Error('unreachable');
  const sleeve = modified.sections.find((s) => s.piece === 'sleeve');
  if (!sleeve) throw new Error('no sleeve section found');
  const i = ctx.sizeIndex;
  const rowsPerIn = modified.gauge.find((g) => g.primary)?.rowsPerIn;
  if (!rowsPerIn) throw new Error('sleeve re-rate needs a row gauge (KB §16.2)');
  const oldRows = sleeve.length?.rows?.[i];
  if (!oldRows) throw new Error('sleeve section has no row length');
  const available = Math.max(2, Math.round(oldRows + p.deltaIn * rowsPerIn));
  const upper = sleeve.startsWith.sts[i]!;
  const cuff = sleeve.endsAt.sts?.[i];
  if (!cuff) throw new Error('sleeve section needs an end checkpoint (cuff sts)');
  const taper = taperSchedule(upper, cuff, available);
  // Rewrite the dominant dec event's schedule to the re-rated split — AT THE
  // MODIFIED SIZE ONLY. Schedules are per-size arrays: replicating one size's
  // split to the others breaks their Σ (found by the Flax golden case).
  const dec = sleeve.events.find((e) => e.type === 'dec');
  if (dec?.schedule) {
    dec.schedule.intervalRows = perSize(dec.schedule.intervalRows, i, modified.sizing.sizeCount, taper.groups[0]?.interval ?? 1);
    dec.schedule.times = perSize(dec.schedule.times, i, modified.sizing.sizeCount, taper.groups[0]?.times ?? 1);
    dec.schedule.variantRows = perSize(dec.schedule.variantRows, i, modified.sizing.sizeCount, taper.groups[1]?.interval ?? 0);
    dec.schedule.variantTimes = perSize(dec.schedule.variantTimes, i, modified.sizing.sizeCount, taper.groups[1]?.times ?? 0);
  }
  // Keep the section length consistent with the new span, or the schedule
  // exceeds it (validatePattern rule 3).
  if (sleeve.length?.rows) {
    sleeve.length.rows = sleeve.length.rows.map((v, idx) => (idx === i ? available : v));
  }
  if (sleeve.length?.in) {
    sleeve.length.in = sleeve.length.in.map((v, idx) => (idx === i ? round2(v + p.deltaIn) : v));
  }
  const steps: SheetStep[] = [{
    id: 'sleeve-rerate',
    sectionId: sleeve.id,
    title: `Sleeve ${p.deltaIn >= 0 ? 'lengthened' : 'shortened'} by ${ctx.L(Math.abs(p.deltaIn))} (taper re-rated)`,
    instruction:
      `Dec rounds now ${describeSplit(taper.groups)} — keep ≥1" even at the top and the cuff rows unchanged.`,
    math: [
      `${upper} → ${cuff} sts = ${(upper - cuff) / 2} dec rounds over ${available} available rows`,
      `split: ${describeSplit(taper.groups)} · Σ rounds = ${sumRows(taper)} · Σ decs = ${sumEvents(taper)}`,
      `VERIFY: ${taper.verify ? 'Σ checks pass' : 'Σ CHECK FAILED'}`,
    ],
    refs: ['KB §16.2', 'engine: taperSchedule'],
  }];
  return { modified, steps };
}

// ── Intent 2: bust accommodation (Herzog §19.2–19.5) ───────────────────────

function applyBust(
  ctx: Ctx,
  modified: Pattern,
): { modified: Pattern; steps: SheetStep[]; warnings: string[] } {
  const p = ctx.request.params;
  if (p.kind !== 'bust') throw new Error('unreachable');
  const prof = ctx.profile;
  const steps: SheetStep[] = [];
  const warnings: string[] = [];
  const front = modified.sections.find(
    (s) => s.piece === 'front' || s.piece === 'body' || s.piece === 'body_tube',
  );
  if (!front) throw new Error('no front/body section found for bust accommodation');
  const gauge = modified.gauge.find((g) => g.primary)!;
  const tightness: Tightness = p.tightness ?? 'average';
  const textured = modified.sections.some((s) =>
    s.stitchPattern?.some((sp) => sp.ref !== 'stockinette'),
  );
  const method =
    p.method && p.method !== 'auto'
      ? p.method
      : textured
        ? 'short_rows'
        : 'vertical_darts';

  if (method === 'vertical_darts') {
    if (prof.fullBustIn === undefined || prof.upperTorsoIn === undefined) {
      throw new Error('vertical darts need fullBustIn + upperTorsoIn on the profile');
    }
    const d = verticalDart(prof.fullBustIn, prof.upperTorsoIn, tightness, gauge.stsPerIn);
    if (d.dartWidthIn <= 0) {
      steps.push({
        id: 'bust-none',
        title: 'No dart needed',
        instruction: 'Your full-bust/upper-torso difference is inside the ease allowance at this fit.',
        math: [`full bust − upper torso − allowance ≤ 0`],
        refs: ['Herzog §19.3'],
      });
      return { modified, steps, warnings };
    }
    // Σ-preserving insertion: paired bust incs now, matching neck-edge decs later.
    const perSide = d.perSideSts;
    front.events.push(
      mkEvent('inc', 'dart:each_front_half', perSide, { cadence: 'every', intervalRows: [4], times: [1] }, 'bust dart incs (Herzog §19.3)'),
      mkEvent('dec', 'neck_edge', perSide, { cadence: 'every', intervalRows: [2], times: [1] }, 'remove dart sts at neck edge (Herzog §19.3)'),
    );
    steps.push({
      id: 'bust-vertical',
      sectionId: front.id,
      title: `Vertical bust darts: +${ctx.L(d.dartWidthIn, 2)} front width`,
      instruction:
        `Increase ${perSide} st(s) at each dart line every 4 rows to the bust apex, then remove the same ${perSide} st(s) at each neck edge before the shoulder (net stitch count unchanged).`,
      math: [
        `${ctx.L(prof.fullBustIn!)} − ${ctx.L(prof.upperTorsoIn!)} − ${ctx.L(subFor(tightness))} (tightness) = ${ctx.L(d.dartWidthIn, 2)} dart`,
        `${ctx.L(d.dartWidthIn, 2)} × ${gauge.stsPerIn} sts/in ÷ 2 halves = ${perSide} sts per half`,
        'Σ: +inc events and −neck decs cancel exactly (endsAt unchanged)',
      ],
      refs: ['Herzog §19.3', 'engine: verticalDart'],
    });
  } else {
    if (prof.frontHemToShoulderIn === undefined || prof.backHemToShoulderIn === undefined) {
      throw new Error('short-row darts need front/back hem-to-shoulder measurements (Herzog §19.4) — ask the user');
    }
    const a = shortRowDartAmount(prof.frontHemToShoulderIn, prof.backHemToShoulderIn, tightness, gauge.rowsPerIn ?? 7);
    if (a.rows > 0) {
      const place = shortRowPlacement(bodyLengthIn(modified));
      front.events.push({
        type: 'short_row',
        location: 'under_fullest_part',
        perSideSts: [0],
        turnPoints: [],
        shortRowMethod: 'given',
        src: 'Herzog §19.4 short-row dart',
      });
      steps.push({
        id: 'bust-shortrows',
        sectionId: front.id,
        title: `Short-row bust darts: ${a.rows} rows (${a.pairs} pairs)`,
        instruction:
          `Starting when the piece measures ${ctx.L(place.startAtIn)}, work ${a.pairs} pairs of short rows under the fullest part of the bust; finish ≥${ctx.L(1)} before armhole shaping. Shortest pair ≈ ${ctx.L(2)} wider than your apex-to-apex span; longest stops ~${ctx.L(0.5)} from each side seam.`,
        math: [
          `front ${ctx.L(prof.frontHemToShoulderIn!)} − back ${ctx.L(prof.backHemToShoulderIn!)} − allowance ${ctx.L(subForSr(tightness))} = ${ctx.L(a.amountIn, 2)}`,
          `${ctx.L(a.amountIn, 2)} × ${gauge.rowsPerIn ?? 7} rows/in → floor to even = ${a.rows} rows`,
          `start at hem-to-armhole − ${ctx.L(2)} = ${ctx.L(place.startAtIn)}`,
        ],
        refs: ['Herzog §19.4', 'engine: shortRowDartAmount/shortRowPlacement'],
      });
    }
  }

  if (prof.fullBustIn !== undefined && prof.upperTorsoIn !== undefined) {
    const bustEase = (ctx.pattern.sizing.bustOrChestIn[ctx.sizeIndex] ?? 0) - prof.fullBustIn;
    if (bustEase < 0) {
      const comp = negativeEaseLengthCompensation(-bustEase);
      steps.push({
        id: 'bust-length-comp',
        title: `Add ${ctx.L(comp, 2)} body length (negative-ease compensation)`,
        instruction: `Because the bust sits ${ctx.L(-bustEase, 2)} into negative ease, knit the body ${ctx.L(comp, 2)} longer than measured.`,
        math: [`${ctx.L(-bustEase, 2)} × ⅔ = ${ctx.L(comp, 2)}`],
        refs: ['Herzog §19.5', 'engine: negativeEaseLengthCompensation'],
      });
    }
  }
  return { modified, steps, warnings };
}

// ── Validation gate (app plan §2) ───────────────────────────────────────────

export function validateAgainstSchematic(pattern: Pattern, sizeIndex: number): ValidationReport {
  const gauge = pattern.gauge.find((g) => g.primary);
  const dimensionChecks: DimensionCheck[] = [];
  const sumChecks: SumCheck[] = [];
  if (gauge) {
    for (const dim of pattern.schematic) {
      const body = pattern.sections.find(
        (s) => (dim.piece === 'back' && (s.piece === 'body' || s.piece === 'body_tube')) || s.piece === dim.piece,
      );
      if (!body) continue;
      const target = dim.in[sizeIndex];
      if (target === undefined) continue;
      const recomputed = recomputedWidth(gauge, body, dim, sizeIndex);
      if (recomputed === null) continue;
      const drift = Math.abs(target - recomputed);
      dimensionChecks.push({
        dimension: `${dim.piece}.${dim.dimension}`,
        sizeIndex,
        targetIn: target,
        recomputedIn: round2(recomputed),
        driftIn: round2(drift),
        pass: drift < ROW_GAUGE_ACTION_THRESHOLD_IN,
      });
    }
  }
  for (const sec of pattern.sections) {
    const start = sec.startsWith.sts[sizeIndex]!;
    const end = sec.endsAt.sts?.[sizeIndex];
    if (end === undefined) continue;
    let delta = 0;
    for (const ev of sec.events) delta += evDelta(ev, sizeIndex);
    const ok = start + delta === end;
    sumChecks.push({
      path: `sections[${sec.id}]`,
      ok,
      detail: `${start} + Σevents ${delta} ${ok ? '=' : '≠'} ${end}`,
    });
  }
  return {
    dimensionChecks,
    sumChecks,
    pass: dimensionChecks.every((d) => d.pass) && sumChecks.every((s) => s.ok),
  };
}

function recomputedWidth(
  gauge: NonNullable<Pattern['gauge'][number]>,
  section: Section,
  dim: { piece: string; dimension: string },
  sizeIndex: number,
): number | null {
  if (dim.dimension === 'width_at_chest') {
    const width = section.startsWith.sts[sizeIndex]! / gauge.stsPerIn;
    // Tube sections (body/body_tube worked in the round) hold the FULL circumference;
    // back/front schematic widths are half of it (KB §13.8: pullover bust = piece × 2).
    const tubeHalved =
      (dim.piece === 'back' || dim.piece === 'front') &&
      (section.piece === 'body' || section.piece === 'body_tube');
    return tubeHalved ? width / 2 : width;
  }
  return null;
}

// ── helpers ─────────────────────────────────────────────────────────────────

interface Ctx {
  pattern: Pattern;
  request: ModificationRequest;
  profile: FitProfile;
  sizeIndex: number;
  /** Display-unit length formatter for human-facing strings. */
  L: (inches: number, digits?: 2) => string;
}

/**
 * KB §6 step 3 — after checkpoint counts change, the shaping between them must
 * still sum exactly. Residue from per-count rounding is absorbed by the first
 * dec/inc event's repeat count; an odd residue (not divisible by 2×perSide)
 * means a checkpoint itself needs a 1-st nudge upstream — surfaced as an error
 * rather than silently broken math.
 */
function rebalanceSection(sec: Section): void {
  if (!sec.endsAt.sts) return;
  for (let i = 0; i < sec.startsWith.sts.length; i++) {
    const start = sec.startsWith.sts[i]!;
    const end = sec.endsAt.sts[i]!;
    let delta = 0;
    for (const ev of sec.events) delta += evDelta(ev, i);
    const residue = start + delta - end;
    if (residue === 0) continue;
    const balancer = sec.events.find(
      (e) => (residue > 0 && e.type === 'dec') || (residue < 0 && e.type === 'inc'),
    );
    if (!balancer?.schedule) {
      throw new Error(
        `sections[${sec.id}] size ${i}: Σ off by ${residue} after conversion and no dec/inc event to absorb it (KB §6)`,
      );
    }
    const step = 2 * (balancer.perSideSts[i] ?? 1);
    if (residue % step !== 0) {
      throw new Error(
        `sections[${sec.id}] size ${i}: residue ${residue} not divisible by ${step} — round a checkpoint by 1 st (KB §6/§3)`,
      );
    }
    const t = balancer.schedule.times[i] ?? 1;
    balancer.schedule.times[i] = t + Math.trunc(residue / step);
  }
}

function evDelta(ev: ShapingEvent, i: number): number {
  const perSide = ev.perSideSts[i] ?? 0;
  const times = (ev.schedule?.times[i] ?? 1) + (ev.schedule?.variantTimes?.[i] ?? 0);
  const sides = 2;
  const sign = ev.type === 'inc' || ev.type === 'cast_on' ? 1 : -1;
  return (ev.type === 'inc' || ev.type === 'dec' || ev.type === 'bind_off' || ev.type === 'cast_on')
    ? sign * perSide * sides * times
    : 0;
}

function mkEvent(
  type: 'inc' | 'dec',
  location: string,
  perSide: number,
  schedule: { cadence: 'every'; intervalRows: number[]; times: number[] },
  note: string,
): ShapingEvent {
  return { type, location, perSideSts: [perSide], schedule, src: note };
}

/** Per-size schedule write: set index `i`, keep every other size's value
 * (padding missing entries with 0 so arrays stay length sizeCount). */
function perSize(
  arr: number[] | undefined,
  i: number,
  sizeCount: number,
  value: number,
): number[] {
  const out = Array.from({ length: sizeCount }, (_, k) => arr?.[k] ?? 0);
  out[i] = value;
  return out;
}

function describeSplit(groups: { interval: number; times: number }[]): string {
  return groups.map((g) => `every ${g.interval} ×${g.times}`).join(' + ');
}

function subFor(t: Tightness): number {
  return { tight: 1, average: 1.5, loose: 2 }[t];
}

function subForSr(t: Tightness): number {
  return { tight: 1, average: 2, loose: 3 }[t];
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
