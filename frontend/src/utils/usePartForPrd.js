import { useEffect, useState } from 'react'
import { listCustomerOrders } from '../data/queries/customerOrders'
import { listProducts } from '../data/queries/products'

const EMPTY = { part_serial_number: '', part_name: '', order_qty: '', order_type: '' }

/** Read-only part details for a PRD (customer orders row + Product Master
 * name), for the auto-filled Part Serial Number / Part Name fields the
 * client specs show on transaction screens. Empty strings until loaded or
 * when no PRD is selected. */
export default function usePartForPrd(prdNo) {
  const [part, setPart] = useState(EMPTY)

  useEffect(() => {
    if (!prdNo) {
      setPart(EMPTY)
      return undefined
    }
    let cancelled = false
    Promise.all([listCustomerOrders(), listProducts()])
      .then(([orders, products]) => {
        if (cancelled) return
        const order = orders.find((o) => o.prd_no === prdNo)
        const product = products.find((p) => p.part_serial_number === order?.part_serial_number)
        setPart({
          part_serial_number: order?.part_serial_number ?? '',
          part_name: product?.part_name ?? '',
          order_qty: order?.order_qty ?? '',
          order_type: order?.order_type ?? '',
        })
      })
      .catch(() => {
        // Display-only lookup: a failure leaves the boxes blank rather than
        // blocking the screen's own save flow.
        if (!cancelled) setPart(EMPTY)
      })
    return () => {
      cancelled = true
    }
  }, [prdNo])

  return part
}
