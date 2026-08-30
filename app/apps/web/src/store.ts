import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Pattern } from '@knitting/schema'
import type { FitProfile, ModificationSheet, ValidationReport } from '@knitting/shared'
import { flaxLike } from '@knitting/engine'
import type { DisplayUnit } from './units'
import { mergeBackup, type BackupFile } from './backup'
import { loadAll, saveAll } from './storage'
import { openVault, sealVault, type VaultEnvelope } from './vault'

/**
 * App state for the shell. Local-first (app plan §2): everything lives on the
 * device. localStorage stands in for IndexedDB/Dexie until M5 — the storage
 * seam is this module only.
 */

export interface StoredResult {
  id: string
  patternName: string
  sizeLabel: string
  raw: string
  sheet: ModificationSheet
  validation: ValidationReport
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
}

const KEY = 'knitting.web.v1'

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppState>
      return {
        patterns: parsed.patterns ?? [],
        profiles: parsed.profiles ?? [],
        results: parsed.results ?? [],
        displayUnit: parsed.displayUnit ?? 'in',
        patternUnit: parsed.patternUnit ?? 'in',
        activeProfileId: parsed.activeProfileId ?? null,
        profileVault: parsed.profileVault ?? null,
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
  }
}

export function useStore() {
  const [state, setState] = useState<AppState>(load)
  const hydrated = useRef(false)

  // M5: IndexedDB (Dexie) hydrates once — it is the durable source of truth;
  // localStorage remains the synchronous bootstrap cache.
  useEffect(() => {
    void loadAll().then((persisted) => {
      if (persisted && !hydrated.current) {
        hydrated.current = true
        setState((s) => ({
          ...s,
          patterns: persisted.patterns.length > 0 ? persisted.patterns : s.patterns,
          profiles: persisted.profiles,
          results: persisted.results.slice(0, 50),
          displayUnit: persisted.settings.displayUnit,
          patternUnit: persisted.settings.patternUnit,
          activeProfileId: persisted.settings.activeProfileId,
        }))
      }
    })
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      // storage full/blocked: app keeps working in-memory
    }
    void saveAll({
      patterns: state.patterns,
      profiles: state.profiles,
      results: state.results,
      settings: {
        displayUnit: state.displayUnit,
        patternUnit: state.patternUnit,
        activeProfileId: state.activeProfileId,
      },
    })
  }, [state])

  const addPattern = useCallback((pattern: Pattern) => {
    setState((s) => ({ ...s, patterns: [...s.patterns, pattern] }))
  }, [])

  const removePattern = useCallback((name: string) => {
    setState((s) => ({ ...s, patterns: s.patterns.filter((p) => p.meta.name !== name) }))
  }, [])

  const saveProfile = useCallback((profile: FitProfile) => {
    setState((s) => {
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
    setState((s) => ({ ...s, profiles: s.profiles.filter((p) => p.id !== id) }))
  }, [])

  const addResult = useCallback((result: StoredResult) => {
    setState((s) => ({ ...s, results: [result, ...s.results].slice(0, 50) }))
  }, [])

  const removeResult = useCallback((id: string) => {
    setState((s) => ({ ...s, results: s.results.filter((r) => r.id !== id) }))
  }, [])

  /** Restore a backup file (merge semantics in backup.ts mergeBackup). */
  const restoreBackup = useCallback((file: BackupFile) => {
    setState((s) => ({ ...s, ...mergeBackup(s, file).next }))
  }, [])

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
    if (!passphrase) return false
    const envelope = await sealVault(JSON.stringify(state.profiles), passphrase)
    setState((s) => ({ ...s, profiles: [], profileVault: envelope, activeProfileId: null }))
    return true
  }, [state.profiles])

  /** Decrypt the vault for this session (passphrase held in memory only). */
  const unlockProfiles = useCallback(async (passphrase: string): Promise<boolean> => {
    if (!state.profileVault) return false
    const json = await openVault(state.profileVault, passphrase)
    if (json === null) return false
    setState((s) => ({ ...s, profiles: JSON.parse(json) as FitProfile[] }))
    return true
  }, [state.profileVault])

  const actions = useMemo(
    () => ({
      addPattern,
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
    }),
    [
      addPattern,
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
    ],
  )

  return { ...state, actions }
}

export type Store = ReturnType<typeof useStore>

export function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}
