/**
 * Modification applier — runs the 5 MVP intents over a Pattern IR
 * (specs/intent_grammar.md §2). Deterministic: same inputs → same outputs,
 * every change Σ-verified and reported in the validation gate.
 */
import { garmentEligibility, validatePattern, type Pattern, type Section, type ShapingEvent } from '@knitting/schema';
import {
  convertCount,
  convertRows,
  rowGaugeDrift,
  ROW_GAUGE_ACTION_THRESHOLD_IN,
} from './gauge.js';
import { evenIntervalSplit, sumEvents, sumRows, taperSchedule } from './shaping.js';
import {
  negativeEaseLengthCompensation,
  shortRowDartAmount,
  shortRowPlacement,
  verticalDart,
} from './darts.js';
import { recommendSizeByUpperTorso, UPPER_TORSO_EASE_TIERS, VK_BUST_EASE_TIERS } from './ease.js';
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
const BUST_TIER_EASE: Record<string, number> = {
  fitted: (VK_BUST_EASE_TIERS.close.min + VK_BUST_EASE_TIERS.close.max) / 2,
  average: (VK_BUST_EASE_TIERS.classic.min + VK_BUST_EASE_TIERS.classic.max) / 2,
  oversized: VK_BUST_EASE_TIERS.oversized.min,
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
  // Count gauges are canonical counts per inch.  Keep multiplication math in
  // canonical inches even when the sheet is displayed in centimetres; using a
  // value such as "49.5 cm × 7 rows/in" would mix units in one equation.
  const C = (inches: number, digits?: 2) => fmtLen(inches, 'in', digits ? { digits } : undefined);
  const ctx: Ctx = { pattern, request, profile, sizeIndex, L, C };
  const steps: SheetStep[] = [];
  const warnings: string[] = [];
  const inputDiagnostics = validatePattern(pattern).filter((d) => d.level === 'error');
  if (inputDiagnostics.length > 0) throw new Error(`pattern is not structurally valid: ${inputDiagnostics[0]!.message}`);
  const garment = garmentEligibility(pattern);
  if (!garment.eligible) throw new Error(`pattern is unavailable for modification: ${garment.reason}`);
  if (!Number.isInteger(sizeIndex) || sizeIndex < 0 || sizeIndex >= pattern.sizing.sizeCount) throw new Error('requested size index is outside the pattern size range');
  if (!intentMatchesKind(request.intent, request.params.kind)) throw new Error(`intent ${request.intent} does not match parameter kind ${request.params.kind}`);
  validateRequestNumbers(request);
  let modified: Pattern = structuredClone(pattern);
  let expectedLength: { piece: 'body' | 'sleeve'; inches: number } | undefined;
  let expectedWidth: { sectionId: string; inches: number } | undefined;

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
      expectedLength = out.expected;
      steps.push(...out.steps);
      break;
    }
    case 'sleeve_length': {
      const out = applySleeveLength(ctx, modified);
      modified = out.modified;
      expectedLength = out.expected;
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
    case 'waist_reposition': {
      const out = applyWaistReposition(ctx, modified);
      modified = out.modified; steps.push(...out.steps); warnings.push(...out.warnings); break;
    }
    case 'hip_width': {
      const out = applyHipWidth(ctx);
      modified = out.modified; steps.push(...out.steps); warnings.push(...out.warnings); break;
    }
    case 'upper_arm_width': {
      const out = applyUpperArmWidth(ctx);
      modified = out.modified; steps.push(...out.steps); warnings.push(...out.warnings); expectedWidth = out.expected; break;
    }
    case 'back_neck_raise': {
      const out = applyBackNeckRaise(ctx, modified);
      modified = out.modified; steps.push(...out.steps); warnings.push(...out.warnings); break;
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
  const validation = validateAgainstSchematic(modified, sizeIndex, expectedLength, expectedWidth);
  return { sheet, validation, modified };
}

function intentMatchesKind(intent: ModificationRequest['intent'], kind: ModificationRequest['params']['kind']): boolean {
  return {
    size_ease_selection: 'size_ease', bust_accommodation: 'bust', body_length_change: 'body_length',
    sleeve_length_change: 'sleeve_length', gauge_conversion: 'gauge', waist_shape_reposition: 'waist_reposition',
    hip_width_change: 'hip_width', upper_arm_width_change: 'upper_arm_width', back_neck_raise: 'back_neck_raise',
  }[intent] === kind;
}

function validateRequestNumbers(request: ModificationRequest): void {
  const p = request.params
  if ((p.kind === 'body_length' || p.kind === 'sleeve_length' || p.kind === 'waist_reposition') && !Number.isFinite(p.deltaIn)) throw new Error('length change must be a finite number');
  if (p.kind === 'gauge' && (!Number.isFinite(p.userStsPerIn) || p.userStsPerIn <= 0 || (p.userRowsPerIn !== undefined && (!Number.isFinite(p.userRowsPerIn) || p.userRowsPerIn <= 0)))) throw new Error('gauge values must be finite and positive');
  if (p.kind === 'size_ease' && p.targetEaseIn !== undefined && !Number.isFinite(p.targetEaseIn)) throw new Error('target ease must be a finite number');
}

// ── Intent 1: size & ease selection (Herzog §19.1) ─────────────────────────

function applySizeEase(
  ctx: Ctx,
  _modified: Pattern,
): { steps: SheetStep[] } {
  const steps: SheetStep[] = [];
  const p = ctx.request.params;
  if (p.kind !== 'size_ease') throw new Error('unreachable');
  const basis = p.basis ?? 'upper_torso';
  const measurement = basis === 'bust' ? ctx.profile.fullBustIn : ctx.profile.upperTorsoIn;
  if (measurement === undefined) throw new Error(`profile needs ${basis === 'bust' ? 'fullBustIn' : 'upperTorsoIn'} for size selection — ask the user`);
  const tierEase = basis === 'bust' ? BUST_TIER_EASE[p.tier ?? 'average'] : TIER_EASE[p.tier ?? 'average'];
  const ease = p.targetEaseIn ?? tierEase;
  if (ease === undefined || !Number.isFinite(ease)) throw new Error('size selection needs a finite ease tier or target ease');
  const finishedBusts = ctx.pattern.schematic
    .filter((d) => d.dimension === 'width_at_chest' && d.piece === 'back')
    .flatMap((d) => d.in.map((w) => w * 2));
  const chartFinishedBusts = finishedBusts.length > 0
    ? finishedBusts
    : ctx.pattern.sizing.measurementBasis === 'finished' && ctx.pattern.sizing.bustOrChestIn.every((v) => Number.isFinite(v) && v > 0)
      ? ctx.pattern.sizing.bustOrChestIn
      : [];
  if (chartFinishedBusts.length === 0) throw new Error('size selection needs explicit finished garment measurements; a to-fit chart cannot be presented as a finished bust');
  const rec = recommendSizeByUpperTorso(measurement, ease, chartFinishedBusts);
  steps.push({
    id: 'size-selection',
    title: `Knit size ${ctx.pattern.sizing.labels[rec.sizeIndex] ?? `#${rec.sizeIndex + 1}`}`,
    instruction: `Choose the size with a ${ctx.L(rec.finishedBustIn)} finished bust (real ease at your ${basis === 'bust' ? 'full bust' : 'upper torso'}: ${ctx.L(rec.upperTorsoEaseIn)}).`,
    math: [
      `${basis === 'bust' ? 'full bust' : 'upper torso'} ${ctx.L(measurement)} + target ease ${ctx.L(ease)} = ${ctx.L(measurement + ease)}`,
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
    // Rounding checkpoint counts can add one shaping repeat. Re-space that
    // event over the source span before validation; changing only `times`
    // would create a schedule longer than the section while Σ still appears
    // to reconcile.
    if (sec.length?.rows) {
      for (const ev of sec.events) {
        if (!ev.schedule) continue;
        for (let i = 0; i < modified.sizing.sizeCount; i++) {
          const totalEvents = (ev.schedule.times[i] ?? 0) + (ev.schedule.variantTimes?.[i] ?? 0);
          const span = sec.length.rows[i];
          const consumed = (ev.schedule.intervalRows[i] ?? 0) * (ev.schedule.times[i] ?? 0)
            + (ev.schedule.variantRows?.[i] ?? 0) * (ev.schedule.variantTimes?.[i] ?? 0);
          if (!span || totalEvents <= 0 || consumed <= span) continue;
          const split = evenIntervalSplit(totalEvents, span);
          ev.schedule.intervalRows = perSize(ev.schedule.intervalRows, i, modified.sizing.sizeCount, split.groups[0]?.interval ?? 1);
          ev.schedule.times = perSize(ev.schedule.times, i, modified.sizing.sizeCount, split.groups[0]?.times ?? 0);
          ev.schedule.variantRows = perSize(ev.schedule.variantRows, i, modified.sizing.sizeCount, split.groups[1]?.interval ?? 0);
          ev.schedule.variantTimes = perSize(ev.schedule.variantTimes, i, modified.sizing.sizeCount, split.groups[1]?.times ?? 0);
        }
      }
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
  // `modified.gauge` now contains the user's target row gauge.  Keep the
  // source gauge captured above for the drift comparison; comparing the
  // converted block to itself silently reported zero drift.
  const rgFrom = fromRows;
  if (rgFrom && p.userRowsPerIn) {
    const length = bodyLengthIn(ctx.pattern, ctx.sizeIndex);
    if (length === null) {
      warnings.push('Body length is not declared in the pattern — row-gauge drift is advisory until a measured length is supplied.');
    } else {
      const drift = rowGaugeDrift(length, rgFrom, p.userRowsPerIn);
    warnings.push(
      `Row-gauge drift ${ctx.L(drift, 2)} over the body ${drift >= ROW_GAUGE_ACTION_THRESHOLD_IN
        ? `— EXCEEDS the ${ctx.L(ROW_GAUGE_ACTION_THRESHOLD_IN)} action threshold: prefer work-to-length output (KB §17.2)`
      : `(below the ${ctx.L(ROW_GAUGE_ACTION_THRESHOLD_IN)} action threshold)`}`,
    );
    }
  } else {
    warnings.push('Row gauge missing (pattern or user) — all row-derived output is work-to-length (KB §17.2 step 6).');
  }
  return { modified, steps, warnings };
}

function bodyLengthIn(pattern: Pattern, sizeIndex = 0): number | null {
  const body = pattern.sections.find((s) => s.piece === 'body' || s.piece === 'body_tube');
  return body?.length?.in?.[sizeIndex] ?? null;
}

// ── Intent 3: body length (KB §11 hem rule, §17.2 work-to-length) ──────────

function applyBodyLength(
  ctx: Ctx,
  modified: Pattern,
): { modified: Pattern; steps: SheetStep[]; expected: { piece: 'body'; inches: number } } {
  const p = ctx.request.params;
  if (p.kind !== 'body_length') throw new Error('unreachable');
  // Family-aware: one tube body, OR a flat back+front PAIR (same length change
  // applies to each piece — the flat-set-in golden contract).
  const tube = modified.sections.find((s) => s.piece === 'body' || s.piece === 'body_tube');
  const bodyPieces = tube
    ? [tube]
    : modified.sections.filter((s) => s.piece === 'back' || s.piece === 'front');
  if (bodyPieces.length === 0) throw new Error('no body section found');
  const body = bodyPieces[0]!;
  const rowsPerIn = modified.gauge.find((g) => g.primary)?.rowsPerIn;
  const i = ctx.sizeIndex;
  const oldIn = body.length?.in?.[i];
  if (oldIn === undefined) throw new Error('body section has no declared length at the requested size — supply a measured starting length before changing it');
  const newIn = oldIn + p.deltaIn;
  const steps: SheetStep[] = [];
  for (const piece of bodyPieces) {
    if (piece.length?.in) {
      piece.length.in = piece.length.in.map((v, idx) => (idx === i ? round2(newIn) : v));
    }
    if (piece.length?.rows && rowsPerIn) {
      piece.length.rows = piece.length.rows.map((v, idx) =>
        idx === i ? Math.max(1, Math.round(newIn * rowsPerIn)) : v,
      );
    }
  }
  const unitWord = body.method === 'in_the_round' ? 'rounds' : 'rows';
  steps.push({
    id: 'body-length',
    sectionId: bodyPieces.map((s) => s.id).join('+'),
    title: `Body ${p.deltaIn >= 0 ? 'lengthened' : 'shortened'} by ${ctx.L(Math.abs(p.deltaIn))}${
      bodyPieces.length > 1 ? ` (both ${bodyPieces.map((s) => s.id).join(' and ')} pieces)` : ''
    }`,
    instruction:
      `Work the PLAIN span only (outside any waist shaping): ${rowsPerIn
        ? `add/omit ${Math.abs(Math.round(p.deltaIn * rowsPerIn))} ${unitWord} on each body piece, `
        : ''}or simply work until each piece measures ${ctx.L(newIn)}.`,
    math: [
      `old length ${ctx.L(oldIn)} ${p.deltaIn >= 0 ? '+' : '−'} ${ctx.L(Math.abs(p.deltaIn))} = ${ctx.L(newIn)}`,
      rowsPerIn ? `${ctx.C(newIn)} × ${rowsPerIn} rows/in = ${Math.round(newIn * rowsPerIn)} ${unitWord}` : 'no row gauge — work-to-length (KB §17.2)',
    ],
    refs: ['KB §11 hem rule', 'KB §17.2 step 3', 'engine: work-to-length'],
  });
  return { modified, steps, expected: { piece: 'body', inches: newIn } };
}

// ── Intent 4: sleeve length (KB §16.2 re-rate) ──────────────────────────────

function applySleeveLength(
  ctx: Ctx,
  modified: Pattern,
): { modified: Pattern; steps: SheetStep[]; expected: { piece: 'sleeve'; inches: number } } {
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

  // Family-aware (flat-set-in golden contract): a BOTTOM-UP cap sleeve carries
  // taper incs + cap BO/decs. Length changes go to the TAPER (re-spaced to the
  // new available rows minus the fixed cap span); cap rows are never touched.
  // Σ is preserved because the inc COUNT is unchanged.
  const taperInc = sleeve.events.find((e) => e.type === 'inc' && e.schedule);
  const capEvents = sleeve.events.filter((e) => e.type === 'dec' || e.type === 'bind_off');
  if (taperInc && capEvents.length > 0) {
    return reSpaceCapSleeveTaper(ctx, modified, sleeve, taperInc, capEvents, available, i, p.deltaIn);
  }

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
  // Use the independent row schedule as the target when the source omitted a
  // finished inch column.  Returning a missing/zero target would make the
  // validation gate compare the edited length to an invented zero.
  return { modified, steps, expected: { piece: 'sleeve', inches: round2(available / rowsPerIn) } };
}

/** Bottom-up cap sleeve: re-space the taper incs over (newRows − cap span),
 *  leaving cap shaping untouched. Inc count unchanged → Σ preserved. */
function reSpaceCapSleeveTaper(
  ctx: Ctx,
  modified: Pattern,
  sleeve: Section,
  taperInc: ShapingEvent,
  capEvents: ShapingEvent[],
  available: number,
  i: number,
  deltaIn: number,
): { modified: Pattern; steps: SheetStep[]; expected: { piece: 'sleeve'; inches: number } } {
  const incs = (taperInc.schedule!.times[i] ?? 0) + (taperInc.schedule!.variantTimes?.[i] ?? 0);
  if (incs <= 0) throw new Error('sleeve taper has no scheduled increases');
  const capSpan = capEvents.reduce(
    (acc, ev) =>
      acc +
      (ev.schedule
        ? (ev.schedule.intervalRows[i] ?? 0) * (ev.schedule.times[i] ?? 0) +
          (ev.schedule.variantRows?.[i] ?? 0) * (ev.schedule.variantTimes?.[i] ?? 0)
        : 0),
    0,
  );
  const taperRows = Math.max(incs, available - capSpan);
  const split = evenIntervalSplit(incs, taperRows);
  const sch = taperInc.schedule!;
  sch.intervalRows = perSize(sch.intervalRows, i, modified.sizing.sizeCount, split.groups[0]?.interval ?? 1);
  sch.times = perSize(sch.times, i, modified.sizing.sizeCount, split.groups[0]?.times ?? 1);
  sch.variantRows = perSize(sch.variantRows, i, modified.sizing.sizeCount, split.groups[1]?.interval ?? 0);
  sch.variantTimes = perSize(sch.variantTimes, i, modified.sizing.sizeCount, split.groups[1]?.times ?? 0);
  if (sleeve.length?.rows) {
    sleeve.length.rows = sleeve.length.rows.map((v, idx) => (idx === i ? available : v));
  }
  if (sleeve.length?.in) {
    sleeve.length.in = sleeve.length.in.map((v, idx) => (idx === i ? round2(v + deltaIn) : v));
  }
  const step: SheetStep = {
    id: 'sleeve-rerate',
    sectionId: sleeve.id,
    title: `Sleeve ${deltaIn >= 0 ? 'lengthened' : 'shortened'} by ${ctx.L(Math.abs(deltaIn))} (taper re-spaced, cap rows kept)`,
    instruction:
      `Increase rounds now ${describeSplit(split.groups)}; work the cap exactly as written — cap rows are never re-rated (KB §16.2).`,
    math: [
      `sleeve rows ${available} − cap span ${capSpan} = ${taperRows} taper rows for ${incs} increase rounds`,
      `split: ${describeSplit(split.groups)} · Σ rows = ${sumRows(split)} · Σ incs = ${sumEvents(split)}`,
      'VERIFY: Σ checks pass (inc count unchanged → Σ intact)',
    ],
    refs: ['KB §16.2', 'engine: evenIntervalSplit (cap-aware route)'],
  };
  return { modified, steps: [step], expected: { piece: 'sleeve', inches: round2(available / (modified.gauge.find((g) => g.primary)?.rowsPerIn ?? 1)) } };
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
      mkEvent('inc', 'dart:each_front_half', perSide, { cadence: 'every', intervalRows: [4], times: [1] }, 'bust dart incs (Herzog §19.3)', modified.sizing.sizeCount),
      mkEvent('dec', 'neck_edge', perSide, { cadence: 'every', intervalRows: [2], times: [1] }, 'remove dart sts at neck edge (Herzog §19.3)', modified.sizing.sizeCount),
    );
    steps.push({
      id: 'bust-vertical',
      sectionId: front.id,
      title: `Vertical bust darts: +${ctx.L(d.dartWidthIn, 2)} front width`,
      instruction:
        `Increase ${perSide} st(s) at each dart line every 4 rows to the bust apex, then remove the same ${perSide} st(s) at each neck edge before the shoulder (net stitch count unchanged).`,
      math: [
        `${ctx.L(prof.fullBustIn!)} − ${ctx.L(prof.upperTorsoIn!)} − ${ctx.L(subFor(tightness))} (tightness) = ${ctx.L(d.dartWidthIn, 2)} dart`,
        `${ctx.C(d.dartWidthIn, 2)} × ${gauge.stsPerIn} sts/in ÷ 2 halves = ${perSide} sts per half`,
        'Σ: +inc events and −neck decs cancel exactly (endsAt unchanged)',
      ],
      refs: ['Herzog §19.3', 'engine: verticalDart'],
    });
  } else {
    if (prof.frontHemToShoulderIn === undefined || prof.backHemToShoulderIn === undefined) {
      throw new Error('short-row darts need front/back hem-to-shoulder measurements (Herzog §19.4) — ask the user');
    }
    if (!gauge.rowsPerIn) throw new Error('short-row darts need a declared row gauge; work-to-length cannot verify short-row placement without it');
    const a = shortRowDartAmount(prof.frontHemToShoulderIn, prof.backHemToShoulderIn, tightness, gauge.rowsPerIn);
    if (a.rows > 0) {
      const bodyLength = bodyLengthIn(modified, ctx.sizeIndex);
      if (bodyLength === null) {
        warnings.push('Short-row placement is advisory: the pattern does not state a body length.');
      }
      const place = bodyLength === null ? null : shortRowPlacement(bodyLength);
      front.events.push({
        type: 'short_row',
        location: 'under_fullest_part',
        // Keep the generated event aligned with every size.  Zero is an
        // intentional placeholder because turn-point stitch positions are not
        // yet represented; a one-entry array would create a structural error
        // for multi-size patterns and obscure the intended advisory status.
        perSideSts: Array.from({ length: modified.sizing.sizeCount }, () => 0),
        // These profile values are inches; turnPoints are stitch positions.
        // Until a placement geometry contract exists, keep them empty and
        // mark this event advisory rather than mixing units.
        turnPoints: [],
        shortRowMethod: 'given',
        src: 'Herzog §19.4 short-row dart',
      });
      if (!prof.apexToApexIn || !prof.shortRowStartIn || !prof.shortRowFinishBeforeArmholeIn) {
        warnings.push('Short-row turn points and placement measurements are incomplete; this result is advisory until apex span, start, and finish measurements are supplied.');
      }
      steps.push({
        id: 'bust-shortrows',
        sectionId: front.id,
        title: `Short-row bust darts: ${a.rows} rows (${a.pairs} pairs)`,
        instruction:
          `${place ? `Starting when the piece measures ${ctx.L(place.startAtIn)}, ` : ''}work ${a.pairs} pairs of short rows under the fullest part of the bust; finish ≥${ctx.L(1)} before armhole shaping. Shortest pair ≈ ${ctx.L(2)} wider than your apex-to-apex span; longest stops ~${ctx.L(0.5)} from each side seam.`,
        math: [
          `front ${ctx.L(prof.frontHemToShoulderIn!)} − back ${ctx.L(prof.backHemToShoulderIn!)} − allowance ${ctx.L(subForSr(tightness))} = ${ctx.L(a.amountIn, 2)}`,
          `${ctx.C(a.amountIn, 2)} × ${gauge.rowsPerIn} rows/in → floor to even = ${a.rows} rows`,
          ...(place ? [`start at hem-to-armhole − ${ctx.L(2)} = ${ctx.L(place.startAtIn)}`] : ['start measurement unavailable — advisory']),
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

// ── Bounded post-MVP slices ────────────────────────────────────────────────

function applyWaistReposition(ctx: Ctx, modified: Pattern): { modified: Pattern; steps: SheetStep[]; warnings: string[] } {
  const p = ctx.request.params;
  if (p.kind !== 'waist_reposition') throw new Error('unreachable');
  const waist = modified.sections.find((s) => s.events.some((e) => /waist/i.test(`${e.location} ${e.src ?? ''}`)));
  if (!waist) throw new Error('waist shaping reposition is blocked: the pattern has no explicit waist shaping event/landmark to move');
  if (!waist.length?.in?.[ctx.sizeIndex]) throw new Error('waist shaping reposition is blocked: body plain spans and a hem-to-waist landmark are required');
  // A location-only shift cannot safely rewrite an instruction stream. The
  // contract intentionally blocks until a parser provides explicit plain-span
  // boundaries, rather than moving a schedule by an invented row count.
  throw new Error('waist shaping reposition is blocked: explicit plain spans on both sides of the waist landmark are required');
}

function applyHipWidth(ctx: Ctx): { modified: Pattern; steps: SheetStep[]; warnings: string[] } {
  const p = ctx.request.params;
  if (p.kind !== 'hip_width') throw new Error('unreachable');
  // A repeated event is not a width measurement: applying a delta to each
  // repeat multiplies the user's request.  Until the IR carries explicit hip
  // width checkpoints and plain spans, keep this route blocked.
  throw new Error('hip width change is blocked: explicit hip-width checkpoints and repeat span geometry are required before instructions can be generated');
}

function applyUpperArmWidth(ctx: Ctx): { modified: Pattern; steps: SheetStep[]; warnings: string[]; expected: { sectionId: string; inches: number } } {
  const p = ctx.request.params;
  if (p.kind !== 'upper_arm_width') throw new Error('unreachable');
  // A construction label alone does not prove that the armhole and sleeve
  // checkpoints are coupled.  Do not emit a sleeve-only adjustment.
  throw new Error('upper-arm width change is blocked: validated sleeve/armhole coupling and an armhole checkpoint are required');
}

function applyBackNeckRaise(ctx: Ctx, modified: Pattern): { modified: Pattern; steps: SheetStep[]; warnings: string[] } {
  const p = ctx.request.params;
  if (p.kind !== 'back_neck_raise') throw new Error('unreachable');
  const shortRows = modified.sections.flatMap((s) => s.events.filter((e) => e.type === 'short_row'));
  if (shortRows.length === 0 || shortRows.some((e) => !e.turnPoints || e.turnPoints.length === 0)) throw new Error('back-neck raise is blocked: a complete short-row representation with stitch-position turn points is required');
  throw new Error('back-neck raise is blocked until short-row placement geometry is represented independently from inch measurements');
}

// ── Validation gate (app plan §2) ───────────────────────────────────────────

export function validateAgainstSchematic(
  pattern: Pattern,
  sizeIndex: number,
  expectedLength?: { piece: 'body' | 'sleeve'; inches: number },
  expectedWidth?: { sectionId: string; inches: number },
): ValidationReport {
  const gauge = pattern.gauge.find((g) => g.primary);
  const dimensionChecks: DimensionCheck[] = [];
  const sumChecks: SumCheck[] = [];
  const reasons: string[] = [];
  let schematicChecks = 0;
  const structural = validatePattern(pattern);
  const structuralErrors = structural.filter((d) => d.level === 'error');
  if (structuralErrors.length > 0) reasons.push(...structuralErrors.map((d) => `${d.code}: ${d.message}`));
  if (pattern.sections.some((s) => s.events.some((e) => e.type === 'short_row' && (!e.turnPoints || e.turnPoints.length === 0)))) {
    reasons.push('Short-row turn points are not represented as stitch positions; placement remains advisory until complete geometry is supplied.');
  }
  if (!Number.isInteger(sizeIndex) || sizeIndex < 0 || sizeIndex >= pattern.sizing.sizeCount) reasons.push('Requested size index is outside the pattern size range.');
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
      schematicChecks += 1;
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
  } else reasons.push('No primary gauge: dimensions cannot be recomputed.');
  if (expectedLength) {
    const matching = pattern.sections.filter((s) => expectedLength.piece === 'body'
      ? s.piece === 'body' || s.piece === 'body_tube' || s.piece === 'back' || s.piece === 'front'
      : s.piece === 'sleeve');
    if (matching.length === 0) reasons.push(`No ${expectedLength.piece} section is available for the requested length check.`);
    for (const sec of matching) {
      const rows = sec.length?.rows?.[sizeIndex];
      const rowsPerIn = gauge?.rowsPerIn;
      if (rows === undefined || !rowsPerIn) reasons.push(`${sec.id} length has no row count and row gauge for an independent requested-target check; work-to-length is advisory.`);
      else {
        const recomputed = rows / rowsPerIn;
        const drift = Math.abs(recomputed - expectedLength.inches);
        dimensionChecks.push({ dimension: `${sec.id}.length_from_rows`, sizeIndex, targetIn: expectedLength.inches, recomputedIn: round2(recomputed), driftIn: round2(drift), pass: drift < ROW_GAUGE_ACTION_THRESHOLD_IN });
      }
    }
  }
  if (expectedWidth) {
    const sec = pattern.sections.find((s) => s.id === expectedWidth.sectionId);
    const sts = sec?.startsWith.sts[sizeIndex];
    if (!sec || sts === undefined || !gauge) {
      reasons.push(`No stitch checkpoint and primary gauge are available for the requested width check on ${expectedWidth.sectionId}.`);
    } else {
      const recomputed = sts / gauge.stsPerIn;
      const drift = Math.abs(recomputed - expectedWidth.inches);
      dimensionChecks.push({
        dimension: `${expectedWidth.sectionId}.requested_width`,
        sizeIndex,
        targetIn: expectedWidth.inches,
        recomputedIn: round2(recomputed),
        driftIn: round2(drift),
        pass: drift < ROW_GAUGE_ACTION_THRESHOLD_IN,
      });
    }
  }
  if (pattern.schematic.length > 0 && schematicChecks === 0) {
    const dimensions = pattern.schematic.map((dim) => `${dim.piece}.${dim.dimension}`).join(', ');
    reasons.push(`Schematic geometry is present (${dimensions}) but no supported dimension can be recomputed for the requested size.`);
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
  // A Σ check alone proves only arithmetic consistency.  A verified sheet
  // also needs at least one recomputed requested dimension, and both checks
  // must be available for the evidence gate to pass.
  const checksPass = dimensionChecks.length > 0 && sumChecks.length > 0;
  const incomplete = reasons.length > 0;
  const allPass = checksPass && dimensionChecks.every((d) => d.pass) && sumChecks.every((s) => s.ok) && structuralErrors.length === 0 && !incomplete && structural.every((d) => d.level !== 'warning');
  if (dimensionChecks.length === 0) reasons.push('No recomputable requested dimension is present; result is advisory.');
  if (sumChecks.length === 0) reasons.push('No stitch-count Σ checks are present; result is advisory.');
  if (dimensionChecks.some((d) => !d.pass)) reasons.push('One or more requested dimensions exceed the 0.25″ drift tolerance.');
  if (sumChecks.some((s) => !s.ok)) reasons.push('One or more stitch-count Σ checks failed.');
  const status = structuralErrors.length > 0 || sumChecks.some((s) => !s.ok) || dimensionChecks.some((d) => !d.pass)
    ? 'blocked' as const
    : !checksPass || incomplete || structural.some((d) => d.level === 'warning')
      ? 'advisory' as const
      : 'verified' as const;
  return {
    dimensionChecks,
    sumChecks,
    // Keep `pass` for old callers, but status is the current evidence gate.
    pass: allPass,
    status,
    reasons,
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
  /** Canonical-inch formatter for equations involving counts per inch. */
  C: (inches: number, digits?: 2) => string;
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
  schedule: { cadence: 'every'; intervalRows: [number]; times: [number] },
  note: string,
  sizeCount: number,
): ShapingEvent {
  const fill = (v: number) => Array.from({ length: sizeCount }, () => v);
  return {
    type,
    location,
    perSideSts: fill(perSide),
    schedule: {
      cadence: 'every',
      intervalRows: fill(schedule.intervalRows[0] ?? 1),
      times: fill(schedule.times[0] ?? 1),
    },
    src: note,
  };
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
