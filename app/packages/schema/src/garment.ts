import type { ConstructionType, GarmentKind, Pattern } from './index.js';

const CONSTRUCTION_GARMENTS: Readonly<Partial<Record<ConstructionType, GarmentKind>>> = {
  flat_drop_shoulder: 'sweater',
  flat_set_in: 'sweater',
  flat_raglan: 'sweater',
  flat_saddle: 'sweater',
  steeked_cardigan: 'sweater',
  eps_yoke: 'sweater',
  eps_raglan: 'sweater',
  eps_hybrid: 'sweater',
  kangaroo_cut_armhole: 'sweater',
  top_down_raglan: 'sweater',
  top_down_yoke: 'sweater',
  bottom_up_yoke: 'sweater',
  top_down_set_in: 'sweater',
  contiguous_simultaneous_set_in: 'sweater',
  top_down_saddle: 'sweater',
  dolman_kimono: 'sweater',
  square_set: 'sweater',
  top_down_drop_shoulder: 'sweater',
  modified_drop_shoulder: 'sweater',
  accessory_hat: 'hat',
  accessory_sock: 'sock',
  accessory_mitten: 'mitten',
  accessory_glove: 'glove',
  accessory_scarf: 'scarf',
  accessory_tam: 'tam',
};

const GARMENT_KINDS: ReadonlySet<GarmentKind> = new Set([
  'sweater', 'sock', 'hat', 'mitten', 'glove', 'scarf', 'tam', 'trousers', 'unknown',
]);

export interface GarmentResolution {
  kind: GarmentKind;
  constructionKind: GarmentKind | undefined;
  explicit: boolean;
  compatible: boolean;
}

export interface GarmentEligibility {
  eligible: boolean;
  reason?: string;
  resolution: GarmentResolution;
}

export function isGarmentKind(value: unknown): value is GarmentKind {
  return typeof value === 'string' && GARMENT_KINDS.has(value as GarmentKind);
}

/** Resolves legacy records in memory only; it never writes identity metadata. */
export function resolveGarmentKind(pattern: Pick<Pattern, 'garmentKind' | 'construction'>): GarmentResolution {
  const explicit = Object.prototype.hasOwnProperty.call(pattern, 'garmentKind');
  const constructionKind = CONSTRUCTION_GARMENTS[pattern.construction.type];
  const kind = explicit && isGarmentKind(pattern.garmentKind)
    ? pattern.garmentKind
    : constructionKind ?? 'unknown';
  return {
    kind,
    constructionKind,
    explicit,
    compatible: !explicit || !constructionKind || kind === constructionKind,
  };
}

/** Sweater support is deliberately a workflow gate, separate from structural validity. */
export function garmentEligibility(pattern: Pick<Pattern, 'garmentKind' | 'construction'>): GarmentEligibility {
  const resolution = resolveGarmentKind(pattern);
  if (!resolution.compatible) {
    return { eligible: false, resolution, reason: `Garment selection (${resolution.kind}) conflicts with construction (${resolution.constructionKind}).` };
  }
  if (resolution.kind !== 'sweater') {
    return { eligible: false, resolution, reason: resolution.kind === 'unknown' ? 'Choose and review a supported sweater construction before modifying this pattern.' : `${resolution.kind} modifications are not available yet.` };
  }
  if (pattern.construction.type === 'unknown') {
    return { eligible: false, resolution, reason: 'Review and choose a supported sweater construction before modifying this pattern.' };
  }
  return { eligible: true, resolution };
}
