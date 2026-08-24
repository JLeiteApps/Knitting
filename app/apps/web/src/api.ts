import type { ExtractedField, LlmFieldSpec } from '@knitting/parser'

/**
 * Client for the serverless LLM proxy (app/apps/api — Vercel/Netlify-style
 * handler; Vite dev proxies /api there). The API key never reaches this code.
 * Every failure degrades gracefully: the caller falls back to the notation
 * layer and shows the API as unavailable.
 */
export interface ExtractOutcome {
  ok: boolean
  fields?: ExtractedField[]
  error?: string
}

export async function callExtractViaApi(
  segmentText: string,
  segmentKind: string,
  fields: LlmFieldSpec[],
): Promise<ExtractOutcome> {
  try {
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ segmentText, segmentKind, fields }),
    })
    if (!res.ok) {
      return { ok: false, error: `API ${res.status}: ${await res.text().catch(() => '')}` }
    }
    const body = (await res.json()) as { fields?: ExtractedField[] }
    if (!Array.isArray(body.fields)) {
      return { ok: false, error: 'API response has no fields[] array' }
    }
    return { ok: true, fields: body.fields }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
