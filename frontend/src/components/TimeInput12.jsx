// Stores/round-trips shift times as plain text like "6:00 AM" / "2:00 PM" --
// never 24-hour -- since that's the format already saved in the DB and
// shown elsewhere. Also reads "06:00"/"14:00" style 24-hour text on the way
// in, in case any old rows are stored that way, but always writes back out
// in 12-hour "h:mm AM/PM" form.
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)

function parseTime(value) {
  if (!value) return { hour: '', minute: '', period: 'AM' }

  const ampm = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value.trim())
  if (ampm) {
    return { hour: Number(ampm[1]), minute: Number(ampm[2]), period: ampm[3].toUpperCase() }
  }

  const h24 = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (h24) {
    const hour24 = Number(h24[1])
    const period = hour24 >= 12 ? 'PM' : 'AM'
    const hour = hour24 % 12 === 0 ? 12 : hour24 % 12
    return { hour, minute: Number(h24[2]), period }
  }

  return { hour: '', minute: '', period: 'AM' }
}

function formatTime(hour, minute, period) {
  if (hour === '' || minute === '') return ''
  return `${hour}:${String(minute).padStart(2, '0')} ${period}`
}

export default function TimeInput12({ value, onChange, disabled }) {
  const { hour, minute, period } = parseTime(value)

  function emit(nextHour, nextMinute, nextPeriod) {
    onChange({ target: { value: formatTime(nextHour, nextMinute, nextPeriod) } })
  }

  const selectClass =
    'px-2 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-bmlhblue disabled:bg-gray-100 disabled:text-gray-400'

  return (
    <div className="flex items-center gap-1">
      <select
        className={selectClass}
        value={hour}
        disabled={disabled}
        onChange={(e) => emit(e.target.value === '' ? '' : Number(e.target.value), minute === '' ? 0 : minute, period)}
      >
        <option value="">--</option>
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-gray-400">:</span>
      <select
        className={selectClass}
        value={minute}
        disabled={disabled}
        onChange={(e) => emit(hour === '' ? 12 : hour, e.target.value === '' ? '' : Number(e.target.value), period)}
      >
        <option value="">--</option>
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, '0')}
          </option>
        ))}
      </select>
      <select
        className={selectClass}
        value={period}
        disabled={disabled}
        onChange={(e) => emit(hour === '' ? 12 : hour, minute === '' ? 0 : minute, e.target.value)}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  )
}
