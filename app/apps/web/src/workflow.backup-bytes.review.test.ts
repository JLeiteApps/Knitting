import { describe, expect, it } from 'vitest'
import { buildBackup, parseBackup } from './backup'

const LIMIT = 12 * 1024 * 1024
const empty = () => buildBackup({
  patterns: [], profiles: [], results: [], displayUnit: 'in',
  patternUnit: 'in', activeProfileId: null,
})

describe('independent backup byte boundary review', () => {
  it('rejects multibyte JSON above the byte limit even below the character limit', () => {
    const json = JSON.stringify({ ...empty(), padding: '界'.repeat(Math.ceil(LIMIT / 3)) })
    expect(json.length).toBeLessThan(LIMIT)
    expect(new TextEncoder().encode(json).byteLength).toBeGreaterThan(LIMIT)
    expect(parseBackup(json)).toBeNull()
  })

  it('accepts exactly the byte limit and rejects the next byte', () => {
    const base = JSON.stringify({ ...empty(), padding: '' })
    const paddingLength = LIMIT - new TextEncoder().encode(base).byteLength
    const json = base.replace('"padding":""', `"padding":"${'x'.repeat(paddingLength)}"`)
    expect(new TextEncoder().encode(json).byteLength).toBe(LIMIT)
    expect(parseBackup(json)).not.toBeNull()
    expect(parseBackup(json + ' ')).toBeNull()
  })

  it('does not export unknown session-only state through the backup source', () => {
    const source = {
      patterns: [], profiles: [], results: [], displayUnit: 'in' as const,
      patternUnit: 'in' as const, activeProfileId: null,
      drafts: { profile: { label: 'Synthetic unsaved private draft', fullBustIn: 43 } },
      passphrase: 'synthetic-never-export',
    }
    const json = JSON.stringify(buildBackup(source))
    expect(json).not.toContain('Synthetic unsaved private draft')
    expect(json).not.toContain('synthetic-never-export')
    expect(parseBackup(json)).not.toBeNull()
  })
})
