import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import Library from './screens/Library'
import { MAX_BACKUP_BYTES, buildBackup, serializeBackup, parseBackup } from './backup'
import type { Store } from './store'

let view: ReactTestRenderer | undefined
beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterEach(async () => {
  if (view) await act(async () => view!.unmount())
  view = undefined
  vi.unstubAllGlobals()
})

function source() {
  return { patterns: [], profiles: [], results: [], displayUnit: 'in' as const, patternUnit: 'in' as const, activeProfileId: null }
}

describe('independent library backup UI review', () => {
  it.each(['oversize', 'read-failure'])('does not mutate the library on %s', async (kind) => {
    const restoreBackup = vi.fn()
    const store = { ...source(), actions: { restoreBackup } } as unknown as Store
    await act(async () => { view = create(createElement(Library, { store, go: vi.fn() })) })
    const text = vi.fn().mockRejectedValue(new Error('synthetic read failure'))
    const file = { size: kind === 'oversize' ? MAX_BACKUP_BYTES + 1 : 1, text }
    const input = view!.root.findAllByType('input').find(n => n.props.type === 'file')!
    await act(async () => input.props.onChange({ target: { files: [file], value: 'synthetic' } }))
    expect(restoreBackup).not.toHaveBeenCalled()
    expect(text).toHaveBeenCalledTimes(kind === 'oversize' ? 0 : 1)
  })

  it('uses the actual pretty-printed bytes to guard exports', () => {
    const base = { ...buildBackup(source()), padding: '' }
    const available = MAX_BACKUP_BYTES - new TextEncoder().encode(JSON.stringify(base, null, 2)).byteLength
    const exact = { ...base, padding: 'x'.repeat(available) }
    const json = serializeBackup(exact)
    expect(new TextEncoder().encode(json).byteLength).toBe(MAX_BACKUP_BYTES)
    expect(parseBackup(json)).not.toBeNull()
    expect(() => serializeBackup({ ...base, padding: 'x'.repeat(available + 1) })).toThrow(/12 MiB/)
  })
})
