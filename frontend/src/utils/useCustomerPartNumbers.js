import { useEffect, useMemo, useState } from 'react'
import { customerPartNumbersSupported, listCustomerPartNumbers } from '../data/queries/customerPartNumbers'
import { customerPartMap } from './customerPartNumber'

// Loads every customer part number once (045). `supported` is false before
// 045 is run -> screens hide Customer Part No fields / columns. A failed
// load leaves the map empty (lookups show "—"; console.warn).
export function useCustomerPartNumbers() {
  const [supported, setSupported] = useState(false)
  const [rows, setRows] = useState([])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const ok = await customerPartNumbersSupported()
        if (!active) return
        setSupported(ok)
        if (!ok) return
        const data = await listCustomerPartNumbers()
        if (active) setRows(data)
      } catch (err) {
        console.warn('Customer part numbers not loaded', err)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const map = useMemo(() => customerPartMap(rows), [rows])
  return { supported, rows, map }
}
