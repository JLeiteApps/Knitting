import { afterEach, describe, expect, it, vi } from 'vitest'
import { callClassify } from './classify.mjs'
import { callExtract } from './extract.mjs'

// Transport-only checks: no parser, fit, gauge or product-scope decisions.
const endpoint = 'https://api.example.com/v1/chat/completions'
const apiKey = 'synthetic-private-key'
const privateText = 'synthetic private request text'
const relays = [
  {
    name: 'extract',
    call: (fetchImpl: typeof fetch) => callExtract(
      { segmentText: privateText, segmentKind: 'other', fields: [{ path: 'audit', type: 'string', description: 'test field' }] },
      { endpoint, apiKey, fetchImpl },
    ),
  },
  {
    name: 'classify',
    call: (fetchImpl: typeof fetch) => callClassify(
      { raw: privateText, patternSummary: {} },
      { endpoint, apiKey, fetchImpl },
    ),
  },
]

afterEach(() => vi.restoreAllMocks())

describe.each(relays)('$name relay error privacy', ({ name, call }) => {
  it('keeps reflected keys, requests and provider identifiers out of server logs', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const upstreamBody = `${apiKey}; ${privateText}; synthetic-provider-account`
    const fetchImpl = vi.fn(async () => new Response(upstreamBody, { status: 429 }))

    await expect(call(fetchImpl)).rejects.toMatchObject({ status: 502, message: `upstream ${name} failed` })

    // Only a fixed operation label and the HTTP status are allowed in logs.
    expect(log.mock.calls).toEqual([[`[${name}] upstream error`, 429]])
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('does not consume an untrusted error body to produce its generic failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const text = vi.fn(async () => { throw new Error('synthetic private body-read failure') })
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503, text } as unknown as Response))

    await expect(call(fetchImpl)).rejects.toMatchObject({ status: 502, message: `upstream ${name} failed` })
    expect(text).not.toHaveBeenCalled()
  })

  it.each([false, true])('cancels the error stream without exposing cleanup details (failure=%s)', async (cleanupFails) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cancel = vi.fn(() => {
      if (cleanupFails) throw new Error('synthetic private cancellation failure')
    })
    const response = new Response(new ReadableStream({ cancel }), { status: 503 })
    const fetchImpl = vi.fn(async () => response)

    await expect(call(fetchImpl)).rejects.toMatchObject({ status: 502, message: `upstream ${name} failed` })
    expect(cancel).toHaveBeenCalledOnce()
    expect(log.mock.calls).toEqual([[`[${name}] upstream error`, 503]])
  })
})
