import { useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import FormSection from '../../components/FormSection'
import StatusPill from '../../components/StatusPill'
import { listProducts, productCustomerSupported } from '../../data/queries/products'

// Customer Master card "Products for this customer" (045): read-only list
// of Product Master rows whose customer_id is this customer. Hidden before
// 045. Products are linked to their customer in Product Master, not here.
export default function CustomerProductsSection({ customerId, mode, sectionNumber }) {
  const [supported, setSupported] = useState(false)
  const [products, setProducts] = useState([])
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const ok = await productCustomerSupported()
        if (!active) return
        setSupported(!!ok)
        if (ok) {
          const rows = await listProducts()
          if (active) setProducts(rows)
        }
      } catch (err) {
        console.warn('Products for customer not loaded', err)
        if (active) setLoadError(true)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  if (!supported) return null

  const saved = mode !== 'new' && !!customerId
  const rows = saved ? products.filter((p) => p.customer_id === customerId) : []

  return (
    <FormSection
      icon={Package}
      title={sectionNumber ? `${sectionNumber}. Products for this customer` : 'Products for this customer'}
      subtitle="From Product Master -- link a product to its customer there"
      columns={1}
    >
      <div className="basis-full w-full" data-testid="customer-products">
        {!saved ? (
          <p className="text-xs text-gray-500">Save the customer first; its products will be listed here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#1F3A5F] text-white text-left">
                  {['Part Serial Number', 'Part Name', 'Part Drawing Number', 'Status'].map((h) => (
                    <th key={h} className="px-2 py-1.5 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-2 py-2 text-gray-500">
                      {loadError ? 'Could not load products.' : 'No products linked yet -- set the Customer on the product in Product Master.'}
                    </td>
                  </tr>
                )}
                {rows.map((p) => (
                  <tr key={p.part_serial_number} className="border-b">
                    <td className="px-2 py-1.5 font-medium">{p.part_serial_number}</td>
                    <td className="px-2 py-1.5">{p.part_name}</td>
                    <td className="px-2 py-1.5">{p.part_drawing_reference_number}</td>
                    <td className="px-2 py-1.5">{p.product_status ? <StatusPill status={p.product_status} /> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </FormSection>
  )
}
