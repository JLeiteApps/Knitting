import { describe, expect, it } from 'vitest';
import {
  classifyBracket,
  cmToIn,
  detectMeasurementBasis,
  normalizeNumber,
  parseGaugeStatement,
  parseSizeList,
  segment,
} from '../src/notation.js';

describe('normalizeNumber (KB §12 units)', () => {
  it('handles plain, decimal, unicode and ASCII fractions', () => {
    expect(normalizeNumber('66')).toBe(66);
    expect(normalizeNumber('7.5')).toBe(7.5);
    expect(normalizeNumber('7½')).toBe(7.5);
    expect(normalizeNumber('7 1/2')).toBe(7.5);
    expect(normalizeNumber('⅔')).toBeCloseTo(0.6667, 3);
    expect(normalizeNumber('k2')).toBeNull();
  });

  it('converts cm to inches', () => {
    expect(cmToIn(10)).toBeCloseTo(3.937, 2);
  });
});

describe('parseSizeList (KB §12/§13.9d)', () => {
  it('smallest outside, ascending inside', () => {
    expect(parseSizeList('66 (72, 78, 84, 90, 96) sts')).toEqual([66, 72, 78, 84, 90, 96]);
    expect(parseSizeList('CO 160 (176, 192) sts.')).toEqual([160, 176, 192]);
  });

  it('returns null on absence rather than guessing', () => {
    expect(parseSizeList('work even to end')).toBeNull();
  });
});

describe('classifyBracket (A1 rule)', () => {
  it('numbers matching sizeCount = sizes', () => {
    expect(classifyBracket('72, 78, 84', 3)).toBe('sizes');
  });
  it('verb context = repeat group', () => {
    expect(classifyBracket('k2, m1', 3)).toBe('repeat_group');
    expect(classifyBracket('k1, p1', 3)).toBe('repeat_group');
  });
  it('number list with WRONG count surfaces as unknown (never guessed)', () => {
    expect(classifyBracket('72, 78', 3)).toBe('unknown');
    expect(classifyBracket('72, 78, 84, 90', 3)).toBe('unknown');
  });

  it('instruction words inside brackets are repeat context even with numbers', () => {
    expect(classifyBracket('3 times', 3)).toBe('repeat_group');
  });
});

describe('parseGaugeStatement', () => {
  it('per-4" form with rows', () => {
    const g = parseGaugeStatement('18 sts & 28 rows = 4" (10 cm) in St st')!;
    expect(g.stsPerIn).toBeCloseTo(4.5, 6);
    expect(g.rowsPerIn).toBe(7);
    expect(g.stitchPattern?.toLowerCase()).toContain('st st');
  });
  it('per-inch form (Budd style)', () => {
    const g = parseGaugeStatement('5 sts/inch, 7 rows per inch in stockinette')!;
    expect(g.stsPerIn).toBe(5);
    expect(g.rowsPerIn).toBe(7);
  });
  it('row gauge absent → null rows, not invented', () => {
    const g = parseGaugeStatement('20 sts = 4 inches in Stockinette')!;
    expect(g.stsPerIn).toBe(5);
    expect(g.rowsPerIn).toBeNull();
  });
  it('non-gauge text → null', () => {
    expect(parseGaugeStatement('CO 160 sts')).toBeNull();
  });
});

describe('detectMeasurementBasis (A3 lexicon)', () => {
  it('to-fit vs finished phrasings', () => {
    expect(detectMeasurementBasis('To fit bust: 36 (40, 44)"')).toBe('to_fit');
    expect(detectMeasurementBasis('Fits head 22"')).toBe('to_fit');
    expect(detectMeasurementBasis('Finished chest circumference: 40"')).toBe('finished');
    expect(detectMeasurementBasis('Work even until piece measures 12"')).toBe('unknown');
  });
});

describe('segment (KB §12 document blocks)', () => {
  it('splits blocks and tags pages', () => {
    const doc = [
      '## PDF page 2',
      'SIZES',
      'To fit bust 34 (38, 42)"',
      '',
      'GAUGE',
      '18 sts & 28 rows = 4" in St st',
      '',
      '## PDF page 3',
      'FINISHING',
      'Block and seam.',
    ].join('\n\n');
    const segs = segment(doc);
    expect(segs.find((s) => s.kind === 'sizing')?.page).toBe(2);
    expect(segs.find((s) => s.kind === 'gauge')?.page).toBe(2);
    expect(segs.find((s) => s.kind === 'finishing')?.page).toBe(3);
  });
});

describe('golden regressions — TCK Flax phrasings (tests/golden/flax-worsted)', () => {
  it('gauge stated in rounds with a slash span: "18 sts & 24 rounds / 4”"', () => {
    const g = parseGaugeStatement('gauge: 18 sts & 24 rounds / 4” in stockinette on larger needles.');
    expect(g?.stsPerIn).toBe(4.5);
    expect(g?.rowsPerIn).toBe(6);
  });

  it('"sizing notes:" / "sizing table:" headers classify as sizing', () => {
    expect(segment('sizing notes: Two body length options are given.')[0]?.kind).toBe('sizing');
    expect(segment('sizing table: The sizing table lists finished garment measurements.')[0]?.kind).toBe('sizing');
  });

  it('"finished garment measurements" reads as finished basis', () => {
    expect(detectMeasurementBasis('The sizing table lists finished garment measurements.')).toBe('finished');
  });
});

describe('metric gauge statements (cm spans normalize to per-inch)', () => {
  it('"18 sts & 24 rows = 10 cm" → 4.57 sts/in, 6.1 rows/in', () => {
    const g = parseGaugeStatement('gauge: 18 sts & 24 rows = 10 cm in stocking stitch.');
    expect(g?.stsPerIn).toBe(4.57);
    expect(g?.rowsPerIn).toBe(6.1); // 24 / 3.937 = 6.096
    expect(g?.overIn).toBeCloseTo(3.94, 2);
  });

  it('"24 sts / 10 cm" density phrasing → 6.1 sts/in', () => {
    const g = parseGaugeStatement('24 sts / 10 cm');
    expect(g?.stsPerIn).toBe(6.1);
  });

  it('explicit inch token wins when both units are quoted', () => {
    const g = parseGaugeStatement('20 sts & 28 rows = 4" (10 cm) in St st');
    expect(g?.stsPerIn).toBe(5);
    expect(g?.rowsPerIn).toBe(7);
  });
});
