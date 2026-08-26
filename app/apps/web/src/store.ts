import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Pattern } from '@knitting/schema'
import type { FitProfile, ModificationSheet, ValidationReport } from '@knitting/shared'
import { flaxLike } from '@knitting/engine'
import type { DisplayUnit } from './units'

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
  }
}

export function useStore() {
  const [state, setState] = useState<AppState>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      // storage full/blocked: app keeps working in-memory
    }
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

  const actions = useMemo(
    () => ({
      addPattern,
      removePattern,
      saveProfile,
      removeProfile,
      addResult,
      setDisplayUnit,
      setActiveProfile,
      setPatternUnit,
    }),
    [
      addPattern,
      removePattern,
      saveProfile,
      removeProfile,
      addResult,
      setDisplayUnit,
      setActiveProfile,
      setPatternUnit,
    ],
  )

  return { ...state, actions }
}

export type Store = ReturnType<typeof useStore>

export function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}
