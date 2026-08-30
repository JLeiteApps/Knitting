import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from './store'
import { ToastHost } from './toast'
import Library from './screens/Library'
import AddPattern from './screens/AddPattern'
import FitProfile from './screens/FitProfile'
import NewModification from './screens/NewModification'
import SheetScreen from './screens/SheetScreen'
import { hasSessionDrafts, useSessionDraftRevision } from './sessionDrafts'

export type Route =
  | { name: 'library' }
  | { name: 'add'; patternName?: string }
  | { name: 'profile' }
  | { name: 'newmod'; patternId: string }
  | { name: 'sheet'; resultId: string }

export interface ScreenProps {
  store: ReturnType<typeof useStore>
  go: (route: Route) => void
}

/** Browser/Android back button walks the app's screens (PWA-friendly). */
function routeFromHistory(state: unknown): Route {
  const r = (state as { route?: Route } | null)?.route
  return r?.name ? r : { name: 'library' }
}

export default function App() {
  const store = useStore()
  const [route, setRoute] = useState<Route>({ name: 'library' })
  const mainRef = useRef<HTMLElement>(null)
  useSessionDraftRevision()

  useEffect(() => {
    history.replaceState({ route: { name: 'library' } }, '')
    const onPop = (e: PopStateEvent) => {
      setRoute(routeFromHistory(e.state))
      window.scrollTo(0, 0)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!hasSessionDrafts()) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  })

  const go = useCallback((next: Route) => {
    setRoute(next)
    history.pushState({ route: next }, '')
    window.scrollTo(0, 0)
    // Move focus to the screen content so keyboard/SR users land at the top
    // of the new screen (programmatic focus stays invisible to sighted users).
    mainRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const base = 'Knit Adapt'
    switch (route.name) {
      case 'add':
        document.title = `${base} — Add pattern`
        break
      case 'profile':
        document.title = `${base} — Fit profile`
        break
      case 'newmod':
        document.title = `${base} — modify ${route.patternId}`
        break
      case 'sheet':
        document.title = `${base} — modification sheet`
        break
      default:
        document.title = `${base} — Library`
    }
  }, [route])

  const props: ScreenProps = { store, go }

  if (!store.ready) {
    return (
      <div className="app">
        <main ref={mainRef} tabIndex={-1}>
          <section className="card">
            <h1>Knit Adapt</h1>
            <p className="muted">Loading your local library…</p>
          </section>
        </main>
        <ToastHost />
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header no-print">
        <div className="brand">
          <h1>Knit Adapt</h1>
          <p className="tagline">Verified pattern modifications — the math is done by code, not guesswork.</p>
        </div>
        <div className="header-side">
          <div className="unit-toggle" role="group" aria-label="Display unit">
            <span className="muted small">Show in</span>
            <button
              className={store.displayUnit === 'in' ? 'nav-btn active' : 'nav-btn'}
              aria-pressed={store.displayUnit === 'in'}
              onClick={() => store.actions.setDisplayUnit('in')}
            >
              Inches
            </button>
            <button
              className={store.displayUnit === 'cm' ? 'nav-btn active' : 'nav-btn'}
              aria-pressed={store.displayUnit === 'cm'}
              onClick={() => store.actions.setDisplayUnit('cm')}
            >
              cm
            </button>
          </div>
          <nav className="main-nav" aria-label="Main">
            <button
              className={route.name === 'library' ? 'nav-btn active' : 'nav-btn'}
              onClick={() => go({ name: 'library' })}
            >
              Library
            </button>
            <button
              className={route.name === 'profile' ? 'nav-btn active' : 'nav-btn'}
              onClick={() => go({ name: 'profile' })}
            >
              Fit profile
            </button>
            <button
              className={route.name === 'add' ? 'nav-btn active' : 'nav-btn'}
              onClick={() => go({ name: 'add' })}
            >
              Add pattern
            </button>
          </nav>
        </div>
      </header>

      <main ref={mainRef} tabIndex={-1}>
        {store.storageError && <div className="panel err no-print" role="alert">{store.storageError}</div>}
        {store.saving && <p className="muted small no-print" role="status">Saving on this device… Keep this page open until saving finishes.</p>}
        {route.name === 'library' && <Library {...props} />}
        {route.name === 'add' && <AddPattern key={route.patternName ? `existing:${route.patternName}` : 'new'} {...props} patternName={route.patternName} />}
        {route.name === 'profile' && <FitProfile {...props} />}
        {route.name === 'newmod' && <NewModification key={route.patternId} {...props} patternId={route.patternId} />}
        {route.name === 'sheet' && (
          <SheetScreen {...props} result={store.results.find((r) => r.id === route.resultId)} />
        )}
      </main>

      <footer className="app-footer no-print">
        <p>
          Local-first: patterns, profiles and sheets stay on this device. Only verified sheets
          show instructions. Advisory and blocked sheets explain missing evidence or failed checks.
        </p>
      </footer>

      <ToastHost />
    </div>
  )
}
