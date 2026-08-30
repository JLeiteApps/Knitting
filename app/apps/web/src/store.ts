import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Pattern } from '@knitting/schema'
import type { FitProfile, ModificationRequest, ModificationSheet, ValidationReport } from '@knitting/shared'
import { flaxLike } from '@knitting/engine'
import type { DisplayUnit } from './units'
import { buildBackup, isProfile, isStoredPattern, mergeBackup, normalizeLegacyResult, parseVault, type BackupFile } from './backup'
import { loadAll, saveAll } from './storage'
import { openVault, sealVault, type VaultEnvelope } from './vault'

/**
 * App state for the shell. Local-first (app plan §2): everything lives on the
 * device. IndexedDB holds durable snapshots; localStorage bootstraps the
 * UI and recovers a newer snapshot if an IndexedDB write fails.
 */

export interface StoredResult {
  id: string
  patternName: string
  sizeLabel: string
  raw: string
  sheet: ModificationSheet
  validation: ValidationReport
  /** Recompute inputs for current verification. Legacy rows omit these. */
  request?: ModificationRequest
  modifiedPattern?: Pattern
}

interface AppState {
  patterns: Pattern[]
  profiles: FitProfile[]
  results: StoredResult[]
  /** Display unit shown across the UI; synced from the active profile. */
  displayUnit: DisplayUnit
  /** Remembered default for the AddPattern "pattern units" dropdown. */
  patternUnit: DisplayUnit
  /** Profile whose displayUnit drives the UI (set on select/save). */
  activeProfileId: string | null
  /** At-rest-encrypted profiles (opt-in). When set, profiles[] is empty
   *  until unlocked with the passphrase for this session. */
  profileVault: VaultEnvelope | null
  profilesUnlocked: boolean
  storageError: string | null
  revision: number
}

const KEY = 'knitting.web.v1'

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppState>
      return {
        patterns: (Array.isArray(parsed.patterns) ? parsed.patterns : []).filter(isStoredPattern),
        // A cache written by an older build may contain both an envelope and
        // a stale decrypted copy.  The envelope is the privacy boundary.
        profiles: parsed.profileVault ? [] : (Array.isArray(parsed.profiles) ? parsed.profiles : []).filter(isProfile),
        results: (Array.isArray(parsed.results) ? parsed.results : []).map(safeNormalizeStoredResult).filter((r): r is StoredResult => r !== null),
        displayUnit: parsed.displayUnit ?? 'in',
        patternUnit: parsed.patternUnit ?? 'in',
        activeProfileId: parsed.activeProfileId ?? null,
        profileVault: parseVault(parsed.profileVault),
        profilesUnlocked: !parsed.profileVault,
        storageError: null,
        revision: typeof parsed.revision === 'number' && Number.isFinite(parsed.revision) ? parsed.revision : 0,
      }
    }
  } catch {
    // corrupted storage → fresh start
  }
  return {
    patterns: [flaxLike()],
    profiles: [],
    results: [],
    displayUnit: 'in',
    patternUnit: 'in',
    activeProfileId: null,
    profileVault: null,
    profilesUnlocked: true,
    storageError: null,
    revision: 0,
  }
}

export function useStore() {
  const [state, setState] = useState<AppState>(load)
  const [hydrated, setHydrated] = useState(false)
  const [saving, setSaving] = useState(false)
  const stateRef = useRef(state)
  stateRef.current = state
  const persistQueue = useRef<Promise<void>>(Promise.resolve())
  const revision = useRef(state.revision)
  const persistSeq = useRef(0)
  const vaultPassphrase = useRef<string | null>(null)
  const lastStorageError = useRef<string | null>(null)
  const lastSealedProfiles = useRef<string | null>(null)

  // M5: IndexedDB (Dexie) hydrates once — it is the durable source of truth;
  // localStorage remains the synchronous bootstrap cache.
  useEffect(() => {
    let cancelled = false
    void loadAll().then((persisted) => {
      if (cancelled) return
      if (persisted) {
        setState((s) => {
          // A newer synchronous cache survives an IndexedDB failure. Legacy
          // vaults lived only in that cache and must not be replaced by null.
          if (s.revision > (persisted.revision ?? 0) || s.profileVault && !persisted.profileVault) return s
          if (!persisted.settingsPresent) return {
            ...s,
            profiles: s.profileVault ? [] : [...s.profiles, ...persisted.profiles.filter(isProfile).filter((p) => !s.profiles.some((x) => x.id === p.id))],
          }
          revision.current = Math.max(revision.current, persisted.revision ?? 0)
          return {
          ...s,
          patterns: persisted.patterns.filter(isStoredPattern),
          profiles: persisted.profileVault ? [] : persisted.profiles.filter(isProfile),
          results: persisted.results.map(safeNormalizeStoredResult).filter((r): r is StoredResult => r !== null),
          displayUnit: persisted.settingsPresent ? persisted.settings.displayUnit : s.displayUnit,
          patternUnit: persisted.settingsPresent ? persisted.settings.patternUnit : s.patternUnit,
          activeProfileId: persisted.settingsPresent ? persisted.settings.activeProfileId : s.activeProfileId,
          profileVault: persisted.profileVault ?? null,
          profilesUnlocked: !persisted.profileVault,
          revision: persisted.revision ?? 0,
        }})
      }
      setHydrated(true)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    setSaving(true)
    const seq = ++persistSeq.current
    const current = state
    const persist = async () => {
      let envelope = current.profileVault
      if (envelope && vaultPassphrase.current && current.profilesUnlocked) {
        const serialized = JSON.stringify(current.profiles)
        if (serialized !== lastSealedProfiles.current) {
          try {
            envelope = await sealVault(serialized, vaultPassphrase.current)
            if (seq !== persistSeq.current) return
            lastSealedProfiles.current = serialized
            setState((s) => s.profileVault === current.profileVault ? { ...s, profileVault: envelope } : s)
          } catch {
            const msg = 'Profile encryption failed; the previous encrypted snapshot was retained and no edit was saved.'
            if (lastStorageError.current !== msg) {
              lastStorageError.current = msg
              setState((s) => ({ ...s, storageError: msg }))
            }
            return
          }
        }
      }
      if (seq !== persistSeq.current) return
      const snapshotRevision = revision.current = Math.max(Date.now(), revision.current + 1)
      try {
        // Vault mode never writes decrypted profiles to the bootstrap cache.
        localStorage.setItem(KEY, JSON.stringify({ ...current, profiles: current.profileVault ? [] : current.profiles, profileVault: envelope, profilesUnlocked: !envelope, storageError: null, revision: snapshotRevision }))
      } catch {
        const msg = 'Browser cache is unavailable. Download a backup before closing if device storage also fails.'
        if (lastStorageError.current !== msg) {
          lastStorageError.current = msg
          setState((s) => ({ ...s, storageError: msg }))
        }
      }
      const saved = await saveAll({
        patterns: current.patterns,
        profiles: current.profileVault ? [] : current.profiles,
        results: current.results,
        profileVault: envelope,
        revision: snapshotRevision,
        settings: { displayUnit: current.displayUnit, patternUnit: current.patternUnit, activeProfileId: current.activeProfileId },
      })
      if (!saved.ok && lastStorageError.current !== saved.error) {
        lastStorageError.current = saved.error ?? 'Device storage is unavailable.'
        setState((s) => ({ ...s, storageError: lastStorageError.current }))
      }
    }
    persistQueue.current = persistQueue.current.then(persist).catch(() => {
      setState((s) => ({ ...s, storageError: 'Saving failed. Keep this page open and download a backup before closing it.' }))
    }).finally(() => {
      if (seq === persistSeq.current) setSaving(false)
    })
  }, [state, hydrated])

  useEffect(() => {
    if (!saving || typeof window === 'undefined') return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [saving])

  const addPattern = useCallback((pattern: Pattern): boolean => {
    if (!isStoredPattern(pattern) || stateRef.current.patterns.some((p) => p.meta.name === pattern.meta.name)) return false
    setState((s) => s.patterns.some((p) => p.meta.name === pattern.meta.name) ? s : ({ ...s, patterns: [...s.patterns, pattern] }))
    return true
  }, [])

  const updatePattern = useCallback((name: string, pattern: Pattern): boolean => {
    const existing = stateRef.current.patterns
    if (!isStoredPattern(pattern) || !existing.some((p) => p.meta.name === name) || existing.some((p) => p.meta.name !== name && p.meta.name === pattern.meta.name)) return false
    setState((s) => {
      if (!s.patterns.some((p) => p.meta.name === name) || s.patterns.some((p) => p.meta.name !== name && p.meta.name === pattern.meta.name)) return s
      return { ...s, patterns: s.patterns.map((p) => p.meta.name === name ? pattern : p) }
    })
    return true
  }, [])

  const removePattern = useCallback((name: string) => {
    setState((s) => ({ ...s, patterns: s.patterns.filter((p) => p.meta.name !== name) }))
  }, [])

  const saveProfile = useCallback((profile: FitProfile) => {
    if (!isProfile(profile)) return
    setState((s) => {
      if (s.profileVault && !s.profilesUnlocked) return s
      const exists = s.profiles.some((p) => p.id === profile.id)
      return {
        ...s,
        profiles: exists
          ? s.profiles.map((p) => (p.id === profile.id ? profile : p))
          : [...s.profiles, profile],
      }
    })
  }, [])

  const removeProfile = useCallback((id: string) => {
    setState((s) => s.profileVault && !s.profilesUnlocked ? s : ({ ...s, profiles: s.profiles.filter((p) => p.id !== id) }))
  }, [])

  const addResult = useCallback((result: StoredResult) => {
    if (!normalizeLegacyResult(result)) return
    setState((s) => ({ ...s, results: [result, ...s.results] }))
  }, [])

  const removeResult = useCallback((id: string) => {
    setState((s) => ({ ...s, results: s.results.filter((r) => r.id !== id) }))
  }, [])

  /** Restore a backup file (merge semantics in backup.ts mergeBackup). */
  const restoreBackup = useCallback((file: BackupFile): boolean => {
    const merged = mergeBackup({
      patterns: state.patterns,
      profiles: state.profiles,
      results: state.results,
      displayUnit: state.displayUnit,
      patternUnit: state.patternUnit,
      activeProfileId: state.activeProfileId,
      profileVault: state.profileVault,
    }, file)
    if (merged.conflicts.length > 0) {
      setState((s) => ({ ...s, storageError: merged.conflicts.join(' ') }))
      return false
    }
    const next = merged.next
    const adoptingVault = !state.profileVault && Boolean(next.profileVault)
    if (adoptingVault) vaultPassphrase.current = null
    lastStorageError.current = null
    setState((s) => ({ ...s, ...next, profiles: adoptingVault ? [] : next.profiles, profilesUnlocked: adoptingVault ? false : s.profilesUnlocked, storageError: null }))
    return true
  }, [state])

  /** Header toggle: sets the UI unit and sticks it on the active profile. */
  const setDisplayUnit = useCallback((unit: DisplayUnit) => {
    setState((s) => ({
      ...s,
      displayUnit: unit,
      profiles: s.activeProfileId
        ? s.profiles.map((p) => (p.id === s.activeProfileId ? { ...p, displayUnit: unit } : p))
        : s.profiles,
    }))
  }, [])

  /** A profile became active (selected or saved) — its unit drives the UI. */
  const setActiveProfile = useCallback((id: string | null) => {
    setState((s) => ({
      ...s,
      activeProfileId: id,
      displayUnit: s.profiles.find((p) => p.id === id)?.displayUnit ?? s.displayUnit,
    }))
  }, [])

  const setPatternUnit = useCallback((unit: DisplayUnit) => {
    setState((s) => ({ ...s, patternUnit: unit }))
  }, [])

  /** Encrypt all profiles into the vault and WIPE plaintext from every store. */
  const lockProfiles = useCallback(async (passphrase: string): Promise<boolean> => {
    if (!passphrase || state.profiles.length === 0) return false
    try {
      const serialized = JSON.stringify(state.profiles)
      const envelope = await sealVault(serialized, passphrase)
      if (JSON.stringify(stateRef.current.profiles) !== serialized) return false
      vaultPassphrase.current = null
      lastSealedProfiles.current = serialized
      setState((s) => ({ ...s, profiles: [], profileVault: envelope, activeProfileId: null, profilesUnlocked: false }))
      return true
    } catch { return false }
  }, [state.profiles])

  /** Decrypt the vault for this session (passphrase held in memory only). */
  const unlockProfiles = useCallback(async (passphrase: string): Promise<boolean> => {
    if (!state.profileVault) return false
    const json = await openVault(state.profileVault, passphrase)
    if (json === null) return false
    let profiles: FitProfile[]
    try {
      const parsed: unknown = JSON.parse(json)
      if (!Array.isArray(parsed) || parsed.some((p) => !isProfile(p))) return false
      profiles = parsed as FitProfile[]
    } catch { return false }
    vaultPassphrase.current = passphrase
    lastStorageError.current = null
    setState((s) => ({ ...s, profiles, profilesUnlocked: true, storageError: null }))
    return true
  }, [state.profileVault])

  /** Export a fresh encrypted snapshot, even if autosave is still sealing an edit. */
  const createBackup = useCallback(async (): Promise<BackupFile> => {
    const snapshot = stateRef.current
    let profileVault = snapshot.profileVault
    if (profileVault && snapshot.profilesUnlocked) {
      if (!vaultPassphrase.current) throw new Error('Unlock the profile vault before exporting unsaved edits.')
      profileVault = await sealVault(JSON.stringify(snapshot.profiles), vaultPassphrase.current)
    }
    return buildBackup({ ...snapshot, profileVault })
  }, [])

  const actions = useMemo(
    () => ({
      addPattern,
      updatePattern,
      removePattern,
      saveProfile,
      removeProfile,
      addResult,
      removeResult,
      restoreBackup,
      setDisplayUnit,
      setActiveProfile,
      setPatternUnit,
      lockProfiles,
      unlockProfiles,
      createBackup,
    }),
    [
      addPattern,
      updatePattern,
      removePattern,
      saveProfile,
      removeProfile,
      addResult,
      removeResult,
      restoreBackup,
      setDisplayUnit,
      setActiveProfile,
      setPatternUnit,
      lockProfiles,
      unlockProfiles,
      createBackup,
    ],
  )

  return { ...state, ready: hydrated, saving, actions }
}

export type Store = ReturnType<typeof useStore>

function safeNormalizeStoredResult(value: unknown): StoredResult | null {
  // Saved data has no original pattern/profile snapshot from which to
  // reproduce every requested-target check. Never certify it from Σ alone.
  return normalizeLegacyResult(value)
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}
