import type { ConstructionType } from '@knitting/schema'
import type { Intent } from '@knitting/shared'

export type CapabilityStatus = 'implemented' | 'advisory' | 'blocked' | 'deferred'

export interface CapabilityEntry {
  intent: Intent
  /** `any` is a deliberate wildcard; construction-specific rows take priority. */
  construction: ConstructionType | 'any'
  status: CapabilityStatus
  requiredMeasurements: string[]
  provenance: string[]
  implementedValidation: string[]
}

/**
 * The executable capability registry.  A UI may use this for disclosure, but
 * apply.ts remains the security boundary and repeats the construction gates.
 * New rows must name their required measurements and the checks that make a
 * result actionable.
 */
export const CAPABILITY_MATRIX: readonly CapabilityEntry[] = [
  {
    intent: 'size_ease_selection', construction: 'any', status: 'implemented',
    requiredMeasurements: ['upperTorsoIn or fullBustIn (selected basis)', 'finished garment bust chart'],
    provenance: ['Herzog §19.1', 'pattern sizing/schematic evidence'],
    implementedValidation: ['explicit finished circumference required; to-fit values never presented as finished'],
  },
  {
    intent: 'bust_accommodation', construction: 'any', status: 'advisory',
    requiredMeasurements: ['upperTorsoIn', 'fullBustIn', 'short-row placement fields when short rows are selected'],
    provenance: ['Herzog §19.2–§19.5'],
    implementedValidation: ['Σ checkpoint reconciliation', 'short rows without stitch turn points remain advisory'],
  },
  {
    intent: 'body_length_change', construction: 'any', status: 'implemented',
    requiredMeasurements: ['declared body length at the requested size', 'row gauge for independent row check'],
    provenance: ['KB §11', 'KB §17.2'],
    implementedValidation: ['row-derived requested length check', 'Σ and schedule span checks'],
  },
  {
    intent: 'sleeve_length_change', construction: 'any', status: 'implemented',
    requiredMeasurements: ['sleeve row span', 'row gauge'],
    provenance: ['KB §16.2'],
    implementedValidation: ['row-derived requested length check', 'Σ and schedule span checks'],
  },
  {
    intent: 'gauge_conversion', construction: 'any', status: 'implemented',
    requiredMeasurements: ['user stitch gauge', 'user row gauge when row-derived output is requested'],
    provenance: ['KB §2', 'KB §6', 'KB §17.2'],
    implementedValidation: ['finite positive gauges', 'per-size count and schedule Σ checks'],
  },
  {
    intent: 'waist_shape_reposition', construction: 'any', status: 'blocked',
    requiredMeasurements: ['explicit waist landmark from hem', 'plain spans before and after waist'],
    provenance: ['KB §11', 'Radcliffe §25.1'],
    implementedValidation: ['code-side gate rejects patterns without explicit landmark geometry'],
  },
  {
    intent: 'hip_width_change', construction: 'any', status: 'blocked',
    requiredMeasurements: ['explicit hip and waist shaping events', 'primary stitch gauge'],
    provenance: ['KB §11', 'Radcliffe §25.3'],
    implementedValidation: ['code-side gate requires explicit hip-width checkpoints and repeat span geometry'],
  },
  {
    intent: 'upper_arm_width_change', construction: 'top_down_set_in', status: 'blocked',
    requiredMeasurements: ['coupled sleeve start/end checkpoints', 'primary stitch gauge'],
    provenance: ['KB §11', 'Radcliffe §25.3'],
    implementedValidation: ['construction label is insufficient; code-side armhole coupling gate'],
  },
  {
    intent: 'upper_arm_width_change', construction: 'top_down_saddle', status: 'blocked',
    requiredMeasurements: ['coupled sleeve start/end checkpoints', 'primary stitch gauge'],
    provenance: ['KB §11', 'Radcliffe §25.3'],
    implementedValidation: ['construction label is insufficient; code-side armhole coupling gate'],
  },
  {
    intent: 'upper_arm_width_change', construction: 'any', status: 'blocked',
    requiredMeasurements: ['validated sleeve/armhole coupling'],
    provenance: ['capability boundary pending construction evidence'],
    implementedValidation: ['code-side construction gate'],
  },
  {
    intent: 'back_neck_raise', construction: 'any', status: 'blocked',
    requiredMeasurements: ['complete short-row stitch turn points', 'back-neck placement geometry'],
    provenance: ['KB §10.3b', 'Herzog §19.4'],
    implementedValidation: ['code-side gate rejects inch-only placement fields'],
  },
]

export function capabilityFor(intent: Intent, construction: ConstructionType): CapabilityEntry {
  return CAPABILITY_MATRIX.find((x) => x.intent === intent && x.construction === construction)
    ?? CAPABILITY_MATRIX.find((x) => x.intent === intent && x.construction === 'any')
    ?? {
      intent,
      construction,
      status: 'blocked',
      requiredMeasurements: [],
      provenance: ['no capability entry'],
      implementedValidation: ['unsupported combinations are blocked in code'],
    }
}
