import { describe, expect, it } from 'vitest';
import { callExtract } from './extract.mjs';

const okFetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    choices: [{ message: { content: JSON.stringify({ fields: [{ path: 'gauge.raw', value: 18, confidence: 'high', evidence: '18 sts' }] }) } }],
  }),
});

describe('callExtract proxy', () => {
  it('posts temperature-0 JSON-mode with the contract system rules', async () => {
    let seen;
    const fetchImpl = async (_url, opts) => { seen = JSON.parse(opts.body); return okFetch(); };
    const out = await callExtract(
      { segmentText: '18 sts = 4"', segmentKind: 'gauge', fields: [{ path: 'gauge.raw', type: 'number', description: 'as printed' }] },
      { fetchImpl, endpoint: 'https://x/v1/chat/completions', apiKey: 'k', model: 'm1' },
    );
    expect(seen.temperature).toBe(0);
    expect(seen.response_format.type).toBe('json_object');
    expect(seen.messages[0].content).toContain('NEVER sum');
    expect(seen.headers).toBeUndefined;
    expect(out.fields[0].evidence).toBe('18 sts');
  });

  it('fails closed without credentials', async () => {
    await expect(callExtract({ segmentText: 'x', segmentKind: 'gauge', fields: [] }, { fetchImpl: okFetch, endpoint: undefined, apiKey: undefined })).rejects.toThrow('not configured');
  });
});
