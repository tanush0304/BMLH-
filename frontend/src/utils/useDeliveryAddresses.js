import { useCallback, useEffect, useMemo, useState } from 'react'
import { deliveryAddressesSupported, listDeliveryAddresses } from '../data/queries/deliveryAddresses'
import { addressMap } from './deliveryAddress'

// Loads every customer delivery address once (042). `supported` is false
// before 042 is run -> screens hide Deliver To / address columns. A failed
// load leaves the list empty (never blocks the screen; console.warn).
export function useDeliveryAddresses() {
  const [supported, setSupported] = useState(false)
  const [addresses, setAddresses] = useState([])

  const reload = useCallback(async () => {
    try {
      const ok = await deliveryAddressesSupported()
      setSupported(ok)
      if (!ok) return
      setAddresses(await listDeliveryAddresses())
    } catch (err) {
      console.warn('Delivery addresses not loaded', err)
    }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const ok = await deliveryAddressesSupported()
        if (!active) return
        setSupported(ok)
        if (!ok) return
        const rows = await listDeliveryAddresses()
        if (active) setAddresses(rows)
      } catch (err) {
        console.warn('Delivery addresses not loaded', err)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const byId = useMemo(() => addressMap(addresses), [addresses])
  return { supported, addresses, byId, reload }
}
