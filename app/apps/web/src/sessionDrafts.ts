import { useSyncExternalStore } from 'react'

/**
 * Navigation-only form recovery. This module deliberately owns no durable
 * storage: a tab reload starts fresh and backups never see its contents.
 */
const drafts = new Map<string, unknown>()
const listeners = new Set<() => void>()
let revision = 0

const notify = () => {
  revision += 1
  listeners.forEach((listener) => listener())
}

export function readSessionDraft<T>(key: string): T | null {
  return (drafts.get(key) as T | undefined) ?? null
}

export function writeSessionDraft<T>(key: string, value: T): void {
  drafts.set(key, structuredClone(value))
  notify()
}

export function clearSessionDraft(key: string): void {
  if (drafts.delete(key)) notify()
}

/** Used by the vault boundary so a hidden profile editor cannot retain PII. */
export function clearSessionDrafts(prefix: string): void {
  let changed = false
  for (const key of drafts.keys()) {
    if (key.startsWith(prefix)) changed = drafts.delete(key) || changed
  }
  if (changed) notify()
}

export function hasSessionDrafts(): boolean {
  return drafts.size > 0
}

export function useSessionDraftRevision(): number {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    () => revision,
    () => 0,
  )
}
