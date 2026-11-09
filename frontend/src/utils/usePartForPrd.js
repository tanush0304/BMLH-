import { useEffect, useState } from 'react'
import { listOrdersByPrd } from '../data/queries/customerOrders'
import { listProducts } from '../data/queries/products'
import { deliveryAddressesSupported, listDeliveryAddresses } from '../data/queries/deliveryAddresses'
import { addressMap, deliveryForLine, deliveryLabel } from './deliveryAddress'

// Before 042 (no address table) the delivery lookup is skipped; a failed
// address read only blanks Deliver To.
async function loadAddresses() {
  try {
    return (await deliveryAddressesSupported()) ? await listDeliveryAddresses() : null
  } catch {
    return null
  }
}

const EMPTY = { part_serial_number: '', part_name: '', part_drawing_reference_number: '', order_qty: '', prd_qty: '', po_number: '', order_line_id: '', order_type: '', delivery: null, deliver_to: '', delivery_supported: false }

/** Read-only part details for a PRD (its PO line via "production orders" + Product Master
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
    Promise.all([listOrdersByPrd(), listProducts(), loadAddresses()])
      .then(([orders, products, addresses]) => {
        if (cancelled) return
        const order = orders.find((o) => o.prd_no === prdNo)
        const product = products.find((p) => p.part_serial_number === order?.part_serial_number)
        setPart({
          part_serial_number: order?.part_serial_number ?? '',
          part_name: product?.part_name ?? '',
          part_drawing_reference_number: product?.part_drawing_reference_number ?? '',
          order_qty: order?.order_qty ?? '', // the PO line's qty
          prd_qty: order?.prd_qty ?? '', // this PRD (batch)
          po_number: order?.po_number ?? '',
          order_line_id: order?.order_line_id ?? '',
          order_type: order?.order_type ?? '',
          delivery: deliveryForLine(order, addresses ? addressMap(addresses) : null),
          deliver_to: deliveryLabel(deliveryForLine(order, addresses ? addressMap(addresses) : null)),
          delivery_supported: !!addresses,
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
