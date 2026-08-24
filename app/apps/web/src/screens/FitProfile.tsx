import { useState } from 'react'
import type { FitProfile } from '@knitting/shared'
import { newId } from '../store'
import type { ScreenProps } from '../App'

type FieldKey =
  | 'upperTorsoIn'
  | 'fullBustIn'
  | 'frontHemToShoulderIn'
  | 'backHemToShoulderIn'
  | 'frontMidHipIn'
  | 'backMidHipIn'

const FIELDS: Array<{ key: FieldKey; label: string; help: string }> = [
  {
    key: 'upperTorsoIn',
    label: 'Upper torso (in)',
    help: 'Around the fullest part of the upper back and chest, above the bust. This is the measurement that sizes the garment (Herzog §19.1).',
  },
  { key: 'fullBustIn', label: 'Full bust (in)', help: 'Around the fullest part of the bust, standing straight.' },
  {
    key: 'frontHemToShoulderIn',
    label: 'Front hem-to-shoulder (in)',
    help: 'Hem to shoulder over the fullest part of the bust — needed for short-row darts (Herzog §19.4).',
  },
  { key: 'backHemToShoulderIn', label: 'Back hem-to-shoulder (in)', help: 'Same vertical on the back — the difference drives the dart amount.' },
  {
    key: 'frontMidHipIn',
    label: 'Front mid-hip width (in)',
    help: 'Side seam to side seam across the belly at mid-hip — belly variant (Herzog §19.3).',
  },
  { key: 'backMidHipIn', label: 'Back mid-hip width (in)', help: 'Same horizontal on the back.' },
]

const emptyForm = (): { label: string; values: Record<FieldKey, string> } => ({
  label: '',
  values: {
    upperTorsoIn: '',
    fullBustIn: '',
    frontHemToShoulderIn: '',
    backHemToShoulderIn: '',
    frontMidHipIn: '',
    backMidHipIn: '',
  },
})

export default function FitProfile({ store }: ScreenProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())

  const edit = (p: FitProfile) => {
    setEditingId(p.id)
    setForm({
      label: p.label,
      values: {
        upperTorsoIn: p.upperTorsoIn?.toString() ?? '',
        fullBustIn: p.fullBustIn?.toString() ?? '',
        frontHemToShoulderIn: p.frontHemToShoulderIn?.toString() ?? '',
        backHemToShoulderIn: p.backHemToShoulderIn?.toString() ?? '',
        frontMidHipIn: p.frontMidHipIn?.toString() ?? '',
        backMidHipIn: p.backMidHipIn?.toString() ?? '',
      },
    })
  }

  const save = () => {
    const label = form.label.trim() || 'My profile'
    const num = (s: string): number | undefined => {
      const v = Number(s)
      return s.trim() !== '' && Number.isFinite(v) && v > 0 ? v : undefined
    }
    const profile: FitProfile = {
      id: editingId ?? newId(),
      label,
      displayUnit: 'in',
      upperTorsoIn: num(form.values.upperTorsoIn),
      fullBustIn: num(form.values.fullBustIn),
      frontHemToShoulderIn: num(form.values.frontHemToShoulderIn),
      backHemToShoulderIn: num(form.values.backHemToShoulderIn),
      frontMidHipIn: num(form.values.frontMidHipIn),
      backMidHipIn: num(form.values.backMidHipIn),
    }
    store.actions.saveProfile(profile)
    setEditingId(null)
    setForm(emptyForm())
  }

  return (
    <>
      <section className="card">
        <h2>Fit profiles</h2>
        <p className="muted">
          Herzog 12-measurement protocol fields used by the MVP intents. Engine math runs in inches
          regardless of display preference.
        </p>
        {store.profiles.length === 0 && <p className="muted">No profiles yet.</p>}
        <ul className="item-list">
          {store.profiles.map((p) => (
            <li key={p.id} className="item">
              <div className="item-body">
                <strong>{p.label}</strong>
                <div className="muted small">
                  {p.upperTorsoIn ? `upper torso ${p.upperTorsoIn}"` : 'upper torso —'}
                  {' · '}
                  {p.fullBustIn ? `full bust ${p.fullBustIn}"` : 'full bust —'}
                  {p.frontHemToShoulderIn && p.backHemToShoulderIn
                    ? ` · hem-to-shoulder ${p.frontHemToShoulderIn}" / ${p.backHemToShoulderIn}"`
                    : ''}
                </div>
              </div>
              <div className="item-actions">
                <button onClick={() => edit(p)}>Edit</button>
                <button className="danger" onClick={() => store.actions.removeProfile(p.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>{editingId ? 'Edit profile' : 'New profile'}</h2>
        <div className="form-grid">
          <label className="field">
            <span>Profile name</span>
            <input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="e.g. Jorge, winter sweaters"
            />
          </label>
          {FIELDS.map((f) => (
            <label key={f.key} className="field">
              <span>{f.label}</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.25"
                min="0"
                value={form.values[f.key]}
                onChange={(e) =>
                  setForm({ ...form, values: { ...form.values, [f.key]: e.target.value } })
                }
              />
              <small className="muted">{f.help}</small>
            </label>
          ))}
        </div>
        <div className="row">
          <button className="primary" onClick={save}>
            Save profile
          </button>
          {editingId && (
            <button
              onClick={() => {
                setEditingId(null)
                setForm(emptyForm())
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </section>
    </>
  )
}
