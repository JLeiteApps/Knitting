/**
 * /api/extract — serverless LLM proxy (specs/app_plan.md §2: the API touches
 * nothing but LLM calls; the key never reaches the client). Provider-agnostic:
 * any OpenAI-compatible /chat/completions endpoint. TODO when the web bundler
 * exists: import the prompt contract from @knitting/parser instead of the
 * inline copy below.
 */

const SYSTEM_RULES = `You extract structured data from knitting pattern text.
Rules:
1. Output ONLY JSON matching the requested fields. No prose.
2. Every number MUST carry "evidence": a VERBATIM substring copied from the input where the number appears.
3. Copy counts exactly. NEVER sum, average, convert, or fix numbers.
4. Unknown or absent → null with confidence "low". Never invent sizes, gauges, or repeats.
5. confidence: "high" = explicitly stated, "medium" = parsed from table/abbreviation context, "low" = inferred from format only.`;

export async function callExtract(
  { segmentText, segmentKind, fields },
  { fetchImpl = fetch, endpoint = process.env.LLM_ENDPOINT, apiKey = process.env.LLM_API_KEY, model = process.env.LLM_MODEL ?? 'gpt-4o-mini' } = {},
) {
  if (!endpoint || !apiKey) throw new Error('LLM_ENDPOINT / LLM_API_KEY not configured');
  const fieldList = fields.map((f) => `- ${f.path} (${f.type}): ${f.description}`).join('\n');
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_RULES },
        { role: 'user', content: `Segment kind: ${segmentKind}\n\nSegment text:\n"""\n${segmentText}\n"""\n\nExtract these fields as {"fields":[{"path","value","confidence","evidence"}]}:\n${fieldList}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return JSON.parse(body.choices[0].message.content);
}

// Vercel/Netlify-style handler
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
  try {
    const out = await callExtract(req.body);
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(out));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: String(e?.message ?? e) }));
  }
}
