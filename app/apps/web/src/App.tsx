import { useState } from 'react'
import { useStore } from './store'
import Library from './screens/Library'
import AddPattern from './screens/AddPattern'
import FitProfile from './screens/FitProfile'
import NewModification from './screens/NewModification'
import SheetScreen from './screens/SheetScreen'

export type Route =
  | { name: 'library' }
  | { name: 'add' }
  | { name: 'profile' }
  | { name: 'newmod'; patternId: string }
  | { name: 'sheet'; resultId: string }

export interface ScreenProps {
  store: ReturnType<typeof useStore>
  go: (route: Route) => void
}

export default function App() {
  const store = useStore()
  const [route, setRoute] = useState<Route>({ name: 'library' })
  const props: ScreenProps = { store, go: setRoute }

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
              onClick={() => setRoute({ name: 'library' })}
            >
              Library
            </button>
            <button
              className={route.name === 'profile' ? 'nav-btn active' : 'nav-btn'}
              onClick={() => setRoute({ name: 'profile' })}
            >
              Fit profile
            </button>
            <button
              className={route.name === 'add' ? 'nav-btn active' : 'nav-btn'}
              onClick={() => setRoute({ name: 'add' })}
            >
              Add pattern
            </button>
          </nav>
        </div>
      </header>

      <main>
        {route.name === 'library' && <Library {...props} />}
        {route.name === 'add' && <AddPattern {...props} />}
        {route.name === 'profile' && <FitProfile {...props} />}
        {route.name === 'newmod' && <NewModification {...props} patternId={route.patternId} />}
        {route.name === 'sheet' && (
          <SheetScreen {...props} result={store.results.find((r) => r.id === route.resultId)} />
        )}
      </main>

      <footer className="app-footer no-print">
        <p>
          Local-first: patterns, profiles and sheets stay on this device. Sheets render only after
          every Σ-check and schematic recompute pass (drift &lt; 0.25&Prime;).
        </p>
      </footer>
    </div>
  )
}
