/** OK / Not OK toggle for a Gauge quality check (048). value: 'OK' | 'Not OK' | ''. */
export default function GaugeButtons({ value, onChange, label = 'Gauge result', disabled = false }) {
  const btn = (v, on, tone) => (
    <button
      type="button"
      aria-pressed={value === v}
      aria-label={`${label}: ${v}`}
      disabled={disabled}
      onClick={() => onChange(value === v ? '' : v)}
      className={`rounded border px-2.5 py-1 text-xs font-medium disabled:opacity-40 ${on ? tone : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
    >
      {v}
    </button>
  )
  return (
    <span className="inline-flex gap-1.5" role="group" aria-label={label}>
      {btn('OK', value === 'OK', 'border-green-600 bg-green-600 text-white')}
      {btn('Not OK', value === 'Not OK', 'border-red-600 bg-red-600 text-white')}
    </span>
  )
}
