import { describe, expect, it } from 'vitest'
import { openVault, sealVault } from './vault'

describe('profile vault (AES-GCM at rest)', () => {
  it('round-trips a profile payload', async () => {
    const env = await sealVault(JSON.stringify({ upperTorsoIn: 36.5 }), 'correct horse')
    expect(env.v).toBe(1)
    const out = await openVault(env, 'correct horse')
    expect(JSON.parse(out!)).toEqual({ upperTorsoIn: 36.5 })
  })

  it('wrong passphrase yields null, no detail leak', async () => {
    const env = await sealVault('{"a":1}', 'right')
    expect(await openVault(env, 'wrong')).toBeNull()
  })

  it('fresh salt+iv per seal (non-deterministic envelopes)', async () => {
    const a = await sealVault('x', 'p')
    const b = await sealVault('x', 'p')
    expect(a.salt).not.toBe(b.salt)
    expect(a.iv).not.toBe(b.iv)
  })
})
