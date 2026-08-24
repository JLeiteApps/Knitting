import { describe, expect, it } from 'vitest';
import { buildExtractPrompt, enforceEvidence, looksScanned } from '../src/llmExtract.js';

const SEGMENT = 'SIZES\nTo fit bust 34 (38, 42)"\nGAUGE\n18 sts & 28 rows = 4" in St st';

describe('evidence gate (parser spec §3 rule 2)', () => {
  it('keeps fields whose evidence is a verbatim substring', () => {
    const r = enforceEvidence(
      [
        { path: 'sizing.bustOrChestIn', value: [34, 38, 42], confidence: 'high', evidence: '34 (38, 42)"' },
        { path: 'gauge.raw', value: '18 sts & 28 rows', confidence: 'high', evidence: '18 sts & 28 rows = 4"' },
      ],
      SEGMENT,
    );
    expect(r.kept).toHaveLength(2);
    expect(r.dropped).toHaveLength(0);
  });

  it('DROPS fields with invented evidence (anti-hallucination)', () => {
    const r = enforceEvidence(
      [{ path: 'sizing.sizeCount', value: 3, confidence: 'high', evidence: 'three sizes offered' }],
      SEGMENT,
    );
    expect(r.kept).toHaveLength(0);
    expect(r.dropped[0]!.reason).toContain('not found verbatim');
  });

  it('drops null values as absent, not errors', () => {
    const r = enforceEvidence(
      [{ path: 'meta.designer', value: null, confidence: 'low', evidence: '' }],
      SEGMENT,
    );
    expect(r.dropped[0]!.reason).toBe('null value');
  });

  it('evidence matching tolerates whitespace differences', () => {
    const r = enforceEvidence(
      [{ path: 'x', value: 1, confidence: 'low', evidence: 'bust 34 (38, 42)' }],
      SEGMENT,
    );
    expect(r.kept).toHaveLength(1);
  });
});

describe('prompt builder', () => {
  it('embeds the system rules and the verbatim segment', () => {
    const msgs = buildExtractPrompt(SEGMENT, 'sizing', [
      { path: 'sizing.bustOrChestIn', type: 'number[]', description: 'per-size bust inches' },
    ]);
    expect(msgs[0]!.role).toBe('system');
    expect(msgs[0]!.content).toContain('NEVER sum');
    expect(msgs[1]!.content).toContain('"""');
    expect(msgs[1]!.content).toContain('per-size bust inches');
  });
});

describe('scanned-page detection (spec §1)', () => {
  it('thin pages are flagged', () => {
    expect(looksScanned('4')).toBe(true);
    expect(looksScanned('')).toBe(true);
    expect(looksScanned('CO 160 (176, 192) sts. Join in the round.')).toBe(false);
  });
});
