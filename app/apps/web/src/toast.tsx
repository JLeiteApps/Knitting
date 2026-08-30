import { useEffect, useState } from 'react'

/**
 * Minimal transient-feedback channel: actions that would otherwise be silent
 * (save, delete, export) get a short confirmation. The host renders an
 * aria-live region, so screen readers announce them too.
 */

interface ToastItem {
  id: number
  message: string
}

type Listener = (item: ToastItem) => void
const listeners = new Set<Listener>()
let seq = 0

export function toast(message: string): void {
  const item = { id: ++seq, message }
  for (const l of listeners) l(item)
}

const DISMISS_MS = 3200

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    const listener: Listener = (item) => {
      setItems((xs) => [...xs.slice(-2), item])
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== item.id)), DISMISS_MS)
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  return (
    <div className="toast-host no-print" aria-live="polite" role="status">
      {items.map((t) => (
        <div key={t.id} className="toast">
          {t.message}
        </div>
      ))}
    </div>
  )
}
