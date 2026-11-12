// Masters > App Settings (admin only, migration 051): the hourly qty cap
// mode + tolerance. The DB (RLS + trg_app_settings_guard) is the real gate:
// only admins can insert / update, values are checked there too.
import { useEffect, useState } from 'react'
import { Settings2 } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import FormSection, { Field, TextInput, SelectInput } from '../../components/FormSection'
import Banner from '../../components/Banner'
import { listAppSettings, saveAppSetting, HOUR_CAP_KEYS } from '../../data/queries/appSettings'
import { listAppUsers } from '../../data/queries/appUsers'
import { HOUR_CAP_MODES, normalizeHourCapSettings, tolerancePctProblem } from '../../utils/hourQtyCap'
import { userDisplayName } from '../../utils/stockEdit'
import { dbErrorMessage } from '../../utils/dbErrors'

const fmtStamp = (iso) => (iso ? new Date(iso).toLocaleString('en-IN') : '')

export default function AppSettingsScreen({ role }) {
  const [state, setState] = useState({ loading: true, supported: true, rows: [] })
  const [users, setUsers] = useState([])
  const [mode, setMode] = useState('strict')
  const [tolerance, setTolerance] = useState('0')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  async function load() {
    try {
      const res = await listAppSettings()
      const byKey = Object.fromEntries(res.rows.map((r) => [r.key, r.value]))
      const norm = normalizeHourCapSettings({ mode: byKey[HOUR_CAP_KEYS.mode], tolerancePct: byKey[HOUR_CAP_KEYS.tolerance] })
      setMode(norm.mode)
      setTolerance(String(norm.tolerancePct))
      setState({ loading: false, ...res })
    } catch (e) {
      setState({ loading: false, supported: true, rows: [] })
      setError(dbErrorMessage(e))
    }
  }

  useEffect(() => {
    load()
    listAppUsers().then(setUsers).catch(() => {})
  }, [])

  const isAdmin = role === 'admin'
  const toleranceError = tolerancePctProblem(tolerance)
  const lastChange = [...state.rows].filter((r) => Object.values(HOUR_CAP_KEYS).includes(r.key) && r.updated_at).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0]

  async function handleSave() {
    if (!isAdmin || toleranceError) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await saveAppSetting(HOUR_CAP_KEYS.mode, mode)
      await saveAppSetting(HOUR_CAP_KEYS.tolerance, String(Number(tolerance)))
      setNotice('Settings saved -- the hourly cap uses them from the next hour save.')
      await load()
    } catch (e) {
      setError(dbErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="App Settings" subtitle="Admin only -- rules the whole app uses" />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {error && <Banner tone="error" message={error} onClose={() => setError(null)} />}
        {notice && <Banner tone="success" message={notice} onClose={() => setNotice(null)} />}
        {!state.loading && !state.supported && (
          <Banner tone="warning" message="Migration 051 has not been run yet -- the hourly cap uses Strict, 0 % until it is." />
        )}
        <FormSection icon={Settings2} title="Hourly quantity cap" subtitle="Produced per hour vs the hour's standard (cycle time)" columns={2}>
          <Field label="Mode" required width="long">
            <SelectInput aria-label="Hourly cap mode" value={mode} onChange={(e) => setMode(e.target.value)} options={HOUR_CAP_MODES} disabled={!isAdmin || !state.supported} />
          </Field>
          <Field label="Tolerance (%)" required>
            <TextInput aria-label="Hourly cap tolerance" type="number" min="0" max="100" step="any" value={tolerance} onChange={(e) => setTolerance(e.target.value)} disabled={!isAdmin || !state.supported} />
            {toleranceError && <span className="mt-0.5 block text-[11px] text-red-700">{toleranceError}</span>}
          </Field>
          <p className="sm:col-span-2 text-xs text-gray-600" data-testid="cap-rule-text">
            Standard for an hour = (slot minutes − idle − setup) ÷ cycle time × (1 + tolerance ÷ 100), rounded down. No cycle time = no cap.
            The planned-qty check (a log can't produce more than the material it reserved at Start) always applies.
          </p>
          {lastChange && (
            <p className="sm:col-span-2 text-xs text-gray-500" data-testid="settings-last-change">
              Last changed by {userDisplayName(lastChange.updated_by, users) || '—'} on {fmtStamp(lastChange.updated_at)}
            </p>
          )}
          <div className="sm:col-span-2">
            <button type="button" onClick={handleSave} disabled={!isAdmin || !state.supported || saving || !!toleranceError} className="rounded bg-bmlhblue px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </FormSection>
      </div>
    </div>
  )
}
