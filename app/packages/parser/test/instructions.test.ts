import { describe, expect, it } from 'vitest';
import {
  classifyCheckpointLabel,
  findSectionHeaders,
  findSizeLists,
  parseLengthStatement,
  parseRepeatStatement,
} from '../src/instructions.js';

/**
 * Golden-anchored: every instruction line below is VERBATIM from the TCK Flax
 * PDF (tests/golden/flax-worsted/text.md) or the spec's worked micro-example
 * (specs/parser_grammar.md §6). Deterministic layer only — no guessing.
 */

describe('findSizeLists (all occurrences + following-label context)', () => {
  it('Flax yoke totals line yields total / sleeve / front+back checkpoints (p.5)', () => {
    const line =
      '[ 124 (140, 144, 160, 172, 192, 208, 216, 228, 236, 248, 268, 284, 256, 284, 308, 308, 336, 348 ) total sts, 26 (28, 28, 32, 34, 38, 42, 44, 46, 46, 48, 54, 58, 52, 58, 62, 60, 64, 64 ) sts at each sleeve, 36 (42, 44, 48, 52, 58, 62, 64, 68, 72, 76, 80, 84, 76, 84, 92, 94, 104, 110 ) sts at each front and back]';
    const lists = findSizeLists(line);
    expect(lists.length).toBe(3);
    expect(lists[0]!.values.slice(0, 3)).toEqual([124, 140, 144]);
    expect(lists[0]!.values.length).toBe(19);
    expect(classifyCheckpointLabel(lists[0]!.contextAfter)).toBe('total');
    expect(lists[1]!.values.slice(0, 3)).toEqual([26, 28, 28]);
    expect(classifyCheckpointLabel(lists[1]!.contextAfter)).toBe('sleeve');
    expect(classifyCheckpointLabel(lists[2]!.contextAfter)).toBe('front_back');
  });

  it('Flax separation line classifies body sts (p.6)', () => {
    const lists = findSizeLists(
      '[80 (92, 100, 108, 116, 128, 136, 144, 152, 164, 172, 180, 188, 208, 224, 248, 272, 292, 316 ) body sts on the needles, sleeve sts are now on hold]',
    );
    expect(lists.length).toBe(1);
    expect(lists[0]!.values[0]).toBe(80);
    expect(classifyCheckpointLabel(lists[0]!.contextAfter)).toBe('body');
  });

  it('sizeCount filter keeps only aligned occurrences (misaligned → dropped, not guessed)', () => {
    const text = 'CO 56 (62, 68) sts, then 80 (92, 100, 108) more';
    expect(findSizeLists(text, 3).map((l) => l.values)).toEqual([[56, 62, 68]]);
    expect(findSizeLists(text, 4).map((l) => l.values)).toEqual([[80, 92, 100, 108]]);
    expect(findSizeLists(text).length).toBe(2); // unfiltered: caller surfaces misalignment
  });

  it('spec §6 micro-example: cast-on and length lists', () => {
    const line = 'CO 160 (176, 192) sts. Join in the round. Work even until piece measures 13 (13, 14)';
    const lists = findSizeLists(line);
    expect(lists.map((l) => l.values)).toEqual([
      [160, 176, 192],
      [13, 13, 14],
    ]);
  });

  it('verb repeat groups with letters never match (A1)', () => {
    expect(findSizeLists('k6, [k1, m1, (k2, m1) 3 times] to end')).toEqual([]);
  });
});

describe('parseRepeatStatement', () => {
  it('named round pair repeat (Flax p.5)', () => {
    const r = parseRepeatStatement(
      'Work rounds 1-2 a total of 7 (8, 8, 9, 10, 12, 13, 14, 15, 15, 16, 18, 20, 16, 19, 21, 20, 22, 22 ) times.',
    );
    expect(r).not.toBeNull();
    expect(r!.rounds).toBe('rounds 1-2');
    expect(r!.times.length).toBe(19);
    expect(r!.times[0]).toBe(7);
    expect(r!.times[8]).toBe(15); // Adult S position
    expect(r!.intervalRounds).toBeUndefined();
  });

  it('interval-list repeat (Flax p.7 sleeves)', () => {
    const r = parseRepeatStatement(
      'Work these 7 (7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 6, 6, 6, 6, 6, 5, 4 ) rounds a total of 3 (2, 2, 3, 3, 4, 6, 7, 8, 8, 9, 11, 13, 13, 14, 13, 15, 17, 20 ) times.',
    );
    expect(r).not.toBeNull();
    expect(r!.intervalRounds?.length).toBe(19);
    expect(r!.intervalRounds?.[0]).toBe(7);
    expect(r!.times.length).toBe(19);
    expect(r!.times[0]).toBe(3);
  });

  it('returns null on plain prose', () => {
    expect(parseRepeatStatement('Work in stockinette until body measures 14" from underarm.')).toBeNull();
  });
});

describe('findSectionHeaders', () => {
  it('Flax instruction flow yields the section order (pp.4-7)', () => {
    const text = [
      'construction: This sweater is worked seamlessly in the round from the top down.',
      'neckline: Using smaller needles cast on 56 sts.',
      'yoke: Marker set-up: [k2, p8, k2, PM] twice',
      'separate body and sleeves: On the separation round body and sleeves will be separated.',
      'body: Work in stockinette until body measures:',
      'sleeves: Place held sts back onto larger needles.',
      'long sleeves: Work 7" in pattern.',
      'finishing: Weave in all ends.',
    ].join('\n');
    const headers = findSectionHeaders(text);
    expect(headers.map((h) => h.id)).toEqual([
      'neckline',
      'yoke',
      'body', // "separate body and sleeves:" — body/sleeve split point
      'body', // "body:" proper
      'sleeve',
      'sleeve',
      'finishing',
    ]);
    expect(headers[0]!.label).toBe('neckline');
    expect(headers[2]!.label).toBe('separate body and sleeves');
  });

  it('non-section labels are ignored', () => {
    expect(findSectionHeaders('sizing notes: Two body length options are given.')).toEqual([]);
  });
});

describe('parseLengthStatement', () => {
  it('Flax body length (p.6)', () => {
    const r = parseLengthStatement('Regular length: Work in stockinette until body measures 5 (5.5, 6, 6.5)" from underarm.');
    expect(r?.values).toEqual([5, 5.5, 6, 6.5]);
  });
  it('yoke "at least" form (p.5)', () => {
    const r = parseLengthStatement('until yoke measures at least 3.25 (3.75, 4.25)” deep');
    expect(r?.values.slice(0, 3)).toEqual([3.25, 3.75, 4.25]);
  });
  it('"Work N” in pattern" sleeve form (p.7)', () => {
    const r = parseLengthStatement('long sleeves: Work 2 (4, 5, 5.5)" in pattern.');
    expect(r?.values).toEqual([2, 4, 5, 5.5]);
  });
  it('prose without lengths → null', () => {
    expect(parseLengthStatement('knit until you reach the markers')).toBeNull();
  });
});
