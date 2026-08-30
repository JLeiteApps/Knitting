import { useEffect, useRef, useState } from 'react'

/**
 * Two-tap destructive action: the first tap arms the button ("Delete" →
 * "Confirm?"), the second within `timeoutMs` fires. Prevents one-tap data
 * loss on touch screens without a blocking dialog (app plan §2: no
 * hover-only affordances; the armed state is visible feedback on its own).
 */
export default function ConfirmButton({
  label,
  confirmLabel = 'Confirm?',
  onConfirm,
  timeoutMs = 3200,
}: {
  label: string
  confirmLabel?: string
  onConfirm: () => void
  timeoutMs?: number
}) {
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const click = () => {
    if (armed) {
      if (timer.current) clearTimeout(timer.current)
      setArmed(false)
      onConfirm()
      return
    }
    setArmed(true)
    timer.current = setTimeout(() => setArmed(false), timeoutMs)
  }

  return (
    <button
      className={armed ? 'danger confirm-armed' : 'danger'}
      aria-label={armed ? `${confirmLabel} — ${label.toLowerCase()}` : label}
      onClick={click}
    >
      {armed ? confirmLabel : label}
    </button>
  )
}
