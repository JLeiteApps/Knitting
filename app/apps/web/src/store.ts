import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Pattern } from '@knitting/schema'
import type { FitProfile, ModificationSheet, ValidationReport } from '@knitting/shared'
import { flaxLike } from '@knitting/engine'

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
      }
    }
  } catch {
    // corrupted storage → fresh start
  }
  return { patterns: [flaxLike()], profiles: [], results: [] }
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

  const actions = useMemo(
    () => ({ addPattern, removePattern, saveProfile, removeProfile, addResult }),
    [addPattern, removePattern, saveProfile, removeProfile, addResult],
  )

  return { ...state, actions }
}

export type Store = ReturnType<typeof useStore>

export function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}
