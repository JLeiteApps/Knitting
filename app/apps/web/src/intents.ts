import type { FitProfile, Intent, ModificationRequest } from '@knitting/shared'

/**
 * Intent labels, card backing (intent grammar §6), and the slot-filling gate
 * (§3). Natural-language drafting lives in nlGrammar.ts (deterministic) and
 * classify.ts (optional LLM pass) — the engine computes, never these files.
 */

export const INTENT_LABELS: Record<Intent, string> = {
  size_ease_selection: 'Size & ease',
  bust_accommodation: 'Bust accommodation',
  body_length_change: 'Body length',
  sleeve_length_change: 'Sleeve length',
  gauge_conversion: 'Gauge conversion',
  waist_shape_reposition: 'Waist shaping position',
  hip_width_change: 'Hip width',
  upper_arm_width_change: 'Upper-arm width',
  back_neck_raise: 'Back-neck raise',
}

export const INTENT_ORDER: Intent[] = [
  'size_ease_selection',
  'bust_accommodation',
  'body_length_change',
  'sleeve_length_change',
  'gauge_conversion',
  'waist_shape_reposition',
  'hip_width_change',
  'upper_arm_width_change',
  'back_neck_raise',
]

/** Confirmation-card backing (intent grammar §6): engine functions + KB refs. */
export const INTENT_BACKING: Record<Intent, { engine: string; refs: string }> = {
  size_ease_selection: { engine: 'recommendSizeByUpperTorso', refs: 'Herzog §19.1; KB §2' },
  bust_accommodation: {
    engine: 'verticalDart · shortRowDartAmount · shortRowPlacement · negativeEaseLengthCompensation',
    refs: 'Herzog §19.2–§19.5',
  },
  body_length_change: { engine: 'plain-span work-to-length recompute', refs: 'KB §11 hem rule; §17.2' },
  sleeve_length_change: { engine: 'taperSchedule', refs: 'KB §16.2' },
  gauge_conversion: { engine: 'convertCount · convertRows · §6 rebalance', refs: 'KB §2/§6; §17.2 drift policy' },
  waist_shape_reposition: { engine: 'waist landmark span validator', refs: 'KB §11; Radcliffe §25.1' },
  hip_width_change: { engine: 'repeat-aware hip shaping', refs: 'KB §11; Radcliffe §25.3' },
  upper_arm_width_change: { engine: 'coupled sleeve/armhole width', refs: 'KB §11; Radcliffe §25.3' },
  back_neck_raise: { engine: 'short-row placement', refs: 'KB §10.3b; Herzog §19.4' },
};

/**
 * Slot-filling gate (intent grammar §3): required inputs that are still
 * missing. Any non-empty result blocks the confirm button.
 */
export function missingSlots(
  intent: Intent,
  params: ModificationRequest['params'],
  profile: FitProfile | undefined,
): string[] {
  const q: string[] = []
  const has = (v: number | undefined | null) => v !== undefined && v !== null && v > 0
  switch (intent) {
    case 'size_ease_selection':
      if (params.kind === 'size_ease' && params.basis === 'bust') {
        if (!has(profile?.fullBustIn)) q.push('What is your full-bust measurement?')
      } else if (!has(profile?.upperTorsoIn)) {
        q.push('What is your upper-torso measurement? (Around the fullest part of the upper back and chest, above the bust — Herzog §19.1.)')
      }
      break
    case 'bust_accommodation':
      if (params.kind === 'bust' && params.method === 'short_rows') {
        if (!has(profile?.frontHemToShoulderIn) || !has(profile?.backHemToShoulderIn)) {
          q.push('Measure front and back hem-to-shoulder over the fullest bust — short-row darts need both (Herzog §19.4).')
        }
      } else {
        if (!has(profile?.upperTorsoIn)) q.push('What is your upper-torso measurement? (Vertical darts need it — Herzog §19.3.)')
        if (!has(profile?.fullBustIn)) q.push('What is your full-bust measurement?')
      }
      break
    case 'body_length_change':
      if (params.kind === 'body_length' && !Number.isFinite(params.deltaIn)) {
        q.push('How much longer or shorter, in inches?')
      }
      break
    case 'sleeve_length_change':
      if (params.kind === 'sleeve_length' && !Number.isFinite(params.deltaIn)) {
        q.push('How much longer or shorter, in inches?')
      }
      break
    case 'gauge_conversion':
      if (params.kind === 'gauge' && !(params.userStsPerIn > 0)) {
        q.push("What's your swatch gauge in stitches per inch?")
      }
      break
    case 'waist_shape_reposition':
      if (params.kind === 'waist_reposition' && (!has(params.landmarkIn) || !Number.isFinite(params.deltaIn))) q.push('Give the waist landmark from the hem and the requested shift.')
      break
    case 'hip_width_change':
      if (params.kind !== 'hip_width' || !Number.isFinite(params.deltaIn)) q.push('Give the hip width change in inches or cm.')
      break
    case 'upper_arm_width_change':
      if (params.kind !== 'upper_arm_width' || !Number.isFinite(params.deltaIn)) q.push('Give the upper-arm width change in inches or cm.')
      break
    case 'back_neck_raise':
      if (params.kind !== 'back_neck_raise' || !Number.isFinite(params.deltaIn)) q.push('Give the back-neck raise in inches or cm.')
      break
  }
  return q
}
