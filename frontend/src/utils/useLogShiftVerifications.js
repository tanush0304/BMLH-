import { useCallback, useEffect, useState } from 'react'
import { listShiftVerificationsForLog } from '../data/queries/shiftVerifications'
import { indexVerifications, verificationKey, decisionText, isShiftLocked } from './shiftVerification'

/**
 * Hour-entry screens (Production Data Entry / Manual Operations): the
 * migration 028 verification rows of the open log, and what they mean for
 * the grid's (entryDate, shiftCode):
 *   current  -- that shift's verification row (or undefined = Pending)
 *   locked   -- Approved, and the user isn't admin
 *   statuses -- { "date|shift": { status, text } } for the history table
 * `reload()` after saving hours (a Rejected shift goes back to Pending).
 */
export default function useLogShiftVerifications({ logId, entryDate, shiftCode, role, appUsers }) {
  const [verifications, setVerifications] = useState([])

  const reload = useCallback(async () => {
    if (!logId) {
      setVerifications([])
      return
    }
    try {
      setVerifications(await listShiftVerificationsForLog(logId))
    } catch {
      // Display-only: a failed lookup leaves the grid editable; the DB
      // lock (028) still refuses changes to an approved shift.
      setVerifications([])
    }
  }, [logId])

  useEffect(() => {
    reload()
  }, [reload])

  const index = indexVerifications(verifications)
  const current = index.get(verificationKey(logId, entryDate, shiftCode))
  const statuses = Object.fromEntries(
    verifications.map((v) => [`${v.log_date}|${v.shift_code}`, { status: v.status, text: decisionText(v, appUsers) }])
  )
  return { current, locked: isShiftLocked(current, role), statuses, reload }
}
