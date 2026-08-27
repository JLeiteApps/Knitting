/**
 * Profile vault — opt-at-rest encryption for body measurements (WebCrypto
 * AES-GCM, key derived per-vault via PBKDF2-SHA256). The passphrase never
 * leaves the device and is never stored; only the ciphertext envelope is
 * persisted. v1 format: { v, salt, iv, ct } — all base64.
 */

export interface VaultEnvelope {
  v: 1
  salt: string
  iv: string
  ct: string
}

const PBKDF2_ITERATIONS = 310_000

const b64 = {
  enc: (buf: ArrayBuffer | Uint8Array): string => {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
    return btoa(String.fromCharCode(...bytes))
  },
  dec: (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function sealVault(
  plaintextJson: string,
  passphrase: string,
): Promise<VaultEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    new TextEncoder().encode(plaintextJson),
  )
  return { v: 1, salt: b64.enc(salt), iv: b64.enc(iv), ct: b64.enc(ct) }
}

export async function openVault(
  envelope: VaultEnvelope,
  passphrase: string,
): Promise<string | null> {
  if (envelope?.v !== 1) return null
  try {
    const key = await deriveKey(passphrase, b64.dec(envelope.salt))
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64.dec(envelope.iv) as unknown as BufferSource },
      key,
      b64.dec(envelope.ct) as unknown as BufferSource,
    )
    return new TextDecoder().decode(pt)
  } catch {
    return null // wrong passphrase or corrupted envelope — never throw details
  }
}
