import { useEffect, useState } from 'react'
import { productCustomerSupported } from '../data/queries/products'

/** True once 045's "products master".customer_id exists (cached probe;
 * false before it, and false while the probe is pending or fails). */
export function useProductCustomerSupported() {
  const [supported, setSupported] = useState(false)
  useEffect(() => {
    let active = true
    productCustomerSupported()
      .then((ok) => active && setSupported(!!ok))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  return supported
}
