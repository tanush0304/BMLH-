import { useEffect, useState } from 'react'
import { Field, AutoFillBox } from './FormSection'
import { deliveryAddressesSupported } from '../data/queries/deliveryAddresses'
import { deliveryAddressLines } from '../utils/deliveryAddress'

/** True once 042's address table exists (cached probe; false before). */
export function useDeliverySupported() {
  const [supported, setSupported] = useState(false)
  useEffect(() => {
    let active = true
    deliveryAddressesSupported()
      .then((ok) => active && setSupported(ok))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  return supported
}

/** Read-only "Order Type" + "Deliver To" boxes for a PRD's PO line, from
 * usePartForPrd(prd). Deliver To is hidden before 042. Long labels truncate
 * with the full address as a tooltip. showCustomerPart: also "Customer Part
 * No" + "Customer Drawing Ref" (045; hidden before it, "—" when none). */
export default function OrderLineFields({ part, width = 'medium', showCustomerPart = false }) {
  const supported = useDeliverySupported()
  const tooltip = deliveryAddressLines(part?.delivery).join('\n')
  return (
    <>
      <Field label="Order Type" width="medium">
        <AutoFillBox value={part?.order_type ?? ''} />
      </Field>
      {supported && (
        <Field label="Deliver To" width={width}>
          <div title={tooltip || undefined} className="min-w-0">
            <AutoFillBox value={part?.deliver_to ?? ''} />
          </div>
        </Field>
      )}
      {showCustomerPart && part?.customer_part_supported && (
        <>
          <Field label="Customer Part No" width="medium">
            <AutoFillBox value={part.customer_part_no} />
          </Field>
          <Field label="Customer Drawing Ref" width="medium">
            <AutoFillBox value={part.customer_drawing_ref} />
          </Field>
        </>
      )}
    </>
  )
}

/** Full delivery address block (FG Despatch form). */
export function DeliveryAddressBlock({ address }) {
  const lines = deliveryAddressLines(address)
  return (
    <div className="input-auto w-full rounded border px-2.5 py-1.5 text-xs leading-4 min-h-[30px] whitespace-pre-line" data-testid="delivery-address-block">
      {lines.length ? lines.join('\n') : ' '}
    </div>
  )
}
