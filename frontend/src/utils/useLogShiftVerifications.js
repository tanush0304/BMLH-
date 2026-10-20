import { useCallback, useEffect, useRef, useState } from 'react'
import { listShiftVerificationsForLog } from '../data/queries/shiftVerifications'
import { indexVerifications, verificationKey, decisionText, isShiftLocked, markRejectedPending } from './shiftVerification'

/**
 * Hour-entry screens (Production Data Entry / Manual Operations): the
 * migration 028 verification rows of the open log, and what they mean for
 * the grid's (entryDate, shiftCode):
 *   current  -- that shift's verification row (or undefined = Pending)
 *   locked   -- Approved, and the user isn't admin
 *   statuses -- { "date|shift": { status, text } } for the history table
 * After saving hours call `resubmitted(date, shift)`: a Rejected shift goes
 * back to Pending in the DB (028 trigger), so it is shown Pending at once and
 * then re-read. Only the latest request's answer is kept, so an older,
 * slower reload can't bring the Rejected banner back.
 */
export default function useLogShiftVerifications({ logId, entryDate, shiftCode, role, appUsers }) {
  const [verifications, setVerifications] = useState([])
  const requestRef = useRef(0)

  const reload = useCallback(async () => {
    const requestId = ++requestRef.current
    if (!logId) {
      setVerifications([])
      return
    }
    try {
      const rows = await listShiftVerificationsForLog(logId)
      if (requestId === requestRef.current) setVerifications(rows)
    } catch {
      // Display-only: a failed lookup leaves the grid editable; the DB
      // lock (028) still refuses changes to an approved shift.
      if (requestId === requestRef.current) setVerifications([])
    }
  }, [logId])

  const resubmitted = useCallback(
    async (logDate, shift) => {
      setVerifications((rows) => markRejectedPending(rows, logDate, shift))
      await reload()
    },
    [reload]
  )

  useEffect(() => {
    reload()
  }, [reload])

  const index = indexVerifications(verifications)
  const current = index.get(verificationKey(logId, entryDate, shiftCode))
  const statuses = Object.fromEntries(
    verifications.map((v) => [`${v.log_date}|${v.shift_code}`, { status: v.status, text: decisionText(v, appUsers) }])
  )
  return { current, locked: isShiftLocked(current, role), statuses, reload, resubmitted }
}

