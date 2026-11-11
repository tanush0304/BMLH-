import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
import { withTypedFields } from '../../utils/numericFields'
import { useEffect, useState } from 'react'
import { ClipboardList, FileStack, Plus, X } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ActionToolbar from '../../components/ActionToolbar'
import FormSection, { Field, TextInput, SelectInput, AutoFillBox } from '../../components/FormSection'
import SearchableSelect from '../../components/SearchableSelect'
import { productOptions } from '../../utils/productOptions'
import RecordsList from '../../components/RecordsList'
import {
  listCustomerOrders,
  createCustomerOrder,
  updateCustomerOrder,
  deleteCustomerOrder,
  listProductionOrders,
} from '../../data/queries/customerOrders'
import { createPoHeader } from '../../data/queries/customerPoHeaders'
import { listCustomerEnquiries } from '../../data/queries/customerEnquiries'
import { listCustomers } from '../../data/queries/customers'
import { listPoHeaders } from '../../data/queries/customerPoHeaders'
import SelectWithAddNew from '../../components/SelectWithAddNew'
import { paymentTermsOptions, deliveryTermsOptions, withCustomer } from '../../utils/poTermsOptions'
import { listProducts, resolveProductWithConfirmation } from '../../data/queries/products'
import { customerDropdownOptions } from '../../utils/customerLabel'
import { enquiryOptionsForOrder } from '../../utils/qtnOption'
import Banner from '../../components/Banner'
import { FieldErrorProvider, useFieldError } from '../../components/FieldError'
import { orderLineProblem } from '../../utils/orderValidation'
import { useDeleteConfirm, recordLabel } from '../../components/ConfirmDialog'
import { ORDER_TYPES, DEFAULT_ORDER_TYPE, orderTypeProblem } from '../../utils/orderType'
import { useDeliveryAddresses } from '../../utils/useDeliveryAddresses'
import { useCustomerPartNumbers } from '../../utils/useCustomerPartNumbers'
import { customerDrawingText, customerPartFor, customerPartNoText } from '../../utils/customerPartNumber'
import { defaultAddressId, deliverToOptions, deliverToProblem, deliveryIdOrNull, deliveryText } from '../../utils/deliveryAddress'
import PoView from './PoView'
import { openPoSupported, listLineStatuses } from '../../data/queries/openPo'
import { fmtQtyIn, poFromMode } from '../../utils/openPo'

const EMPTY_FORM = {
  order_line_id: '',
  prds: '', // PRDs of this line (display only) -- created by Production Planning
  prd_no: '',
  qtn_no: '',
  customer_id: '',
  po_number: '',
  po_date: '',
  part_serial_number: '',
  order_qty: '',
  order_type: '',
  delivery_address_id: '',
  expected_delivery: '',
  customer_po_line_no: '',
}

const EMPTY_PO_HEADER = {
  customer_id: '',
  po_number: '',
  po_date: '',
  delivery_terms: '',
  payment_terms: '',
  valid_from: '',
  valid_to: '',
}

const NEW_PART_VALUE = '__new__'

let lineItemSeq = 0
function emptyLineItem() {
  lineItemSeq += 1
  return {
    key: lineItemSeq,
    partSerialNumber: '',
    isNewPart: false,
    newPartCode: '',
    partName: '',
    drawingNumber: '',
    qtnNo: '',
    orderType: DEFAULT_ORDER_TYPE,
    deliveryAddressId: '',
    orderQty: '',
    expectedDelivery: '',
    customerPoLineNo: '',
  }
}

// One row per PO line (migration 030). PRDs are created per batch in
// Production Planning; "PRDs" shows them (legacy lines keep their old one).
const LIST_COLUMNS = [
  { key: 'prds', label: 'PRDs' },
  { key: 'planned_label', label: 'Planned' },
  { key: 'customer_name', label: 'Customer Name' },
  { key: 'po_number', label: 'PO Number' },
  { key: 'part_serial_number', label: 'Part Serial Number' },
  { key: 'part_drawing_reference_number', label: 'Part Drawing Number' },
  { key: 'order_qty', label: 'Order Qty' },
  { key: 'order_type', label: 'Order Type' },
  { key: 'deliver_to', label: 'Deliver To', needsAddresses: true },
  { key: 'customer_part_no', label: 'Customer Part No', needsCustomerParts: true },
  { key: 'line_status', label: 'Line Status', type: 'status', needsOpenPo: true },
  { key: 'planned_text', label: 'Planned', needsOpenPo: true },
  { key: 'despatched_text', label: 'Despatched', needsOpenPo: true },
  { key: 'expected_delivery', label: 'Expected Delivery' },
]

// Typed columns on a "customer orders" row -- blank optional ones go as null.
const ORDER_LINE_TYPES = { numeric: ['order_qty'], date: ['po_date', 'expected_delivery'] }

// initialMode "po:<id>" (bell: PO validity ended) opens that PO's view.
export default function CustomerOrderScreen({ initialMode = null, role = null }) {
  const [records, setRecords] = useState([])
  const del = useDeleteConfirm()
  const [enquiries, setEnquiries] = useState([])
  const [customers, setCustomers] = useState([])
  // Saved PO headers -- only for the Delivery / Payment Terms dropdown options.
  const [poHeaders, setPoHeaders] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [listSearch, setListSearch] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  // 'view' / 'edit' operate on one existing customer orders row, exactly as
  // before this rework. 'new-po' is the new two-level flow -- its own form
  // state below, kept separate so it never cross-contaminates the
  // single-row form.
  const [mode, setMode] = useState(poFromMode(initialMode) ? 'po' : 'new-po') // + 'po' (043 PO view)
  const [poId, setPoId] = useState(poFromMode(initialMode))
  // 043: annual / open PO (hidden until the column exists)
  const [openPo, setOpenPo] = useState(false)
  const [lineStatus, setLineStatus] = useState(new Map())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const fieldError = useFieldError(saveError, setSaveError)

  const [poHeader, setPoHeader] = useState(EMPTY_PO_HEADER)
  const [lineItems, setLineItems] = useState([emptyLineItem()])
  // 042: customer delivery addresses (hidden until the table exists)
  const delivery = useDeliveryAddresses()
  // 045: customer part numbers -- read-only lookup by customer + part, never saved on the line
  const cparts = useCustomerPartNumbers()
  const listColumns = LIST_COLUMNS.filter(
    (c) => (!c.needsAddresses || delivery.supported) && (!c.needsOpenPo || openPo) && (!c.needsCustomerParts || cparts.supported),
  )

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [orders, prdRows, enq, custs, prods, headers] = await Promise.all([
        listCustomerOrders(),
        listProductionOrders(),
        listCustomerEnquiries(),
        listCustomers(),
        listProducts(),
        listPoHeaders(),
      ])
      setPoHeaders(headers)
      const supported = await openPoSupported()
      setOpenPo(supported)
      if (supported) setLineStatus(new Map((await listLineStatuses()).map((l) => [l.order_line_id, l])))
      setRecords(orders.map((o) => {
        const own = prdRows.filter((p) => p.order_line_id === o.order_line_id)
        const planned = own.reduce((a, p) => a + Number(p.prd_qty), 0)
        return {
          ...o,
          prds: own.map((p) => p.prd_no).sort().join(', ') || '(not planned)',
          planned_qty: planned,
          planned_label: `${planned} of ${Number(o.order_qty)}`,
        }
      }))
      setEnquiries(enq)
      setCustomers(custs)
      setProducts(prods)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  function handleField(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  // Single-line form: a new customer -> its default Deliver To.
  function handleFormCustomer(e) {
    const customerId = e.target.value
    setForm((f) => ({
      ...f,
      customer_id: customerId,
      delivery_address_id:
        customerId === f.customer_id ? f.delivery_address_id : String(defaultAddressId(delivery.addresses, customerId) || ''),
    }))
  }

  // PO header customer -> every line gets that customer's default Deliver To.
  function handlePoCustomer(e) {
    const customerId = e.target.value
    setPoHeader((h) => withCustomer(h, customerId, customers))
    const def = String(defaultAddressId(delivery.addresses, customerId) || '')
    setLineItems((items) => items.map((it) => ({ ...it, deliveryAddressId: def })))
  }

  function handleNew() {
    setPoHeader(EMPTY_PO_HEADER)
    setLineItems([emptyLineItem()])
    setMode('new-po')
    setSaveError(null)
  }

  function handleClear() {
    if (mode === 'new-po') {
      setPoHeader(EMPTY_PO_HEADER)
      setLineItems([emptyLineItem()])
    } else {
      setForm(EMPTY_FORM)
      setMode('new-po')
    }
    setSaveError(null)
  }

  function handleRowClick(row) {
    // 043: a line of a PO opens the whole PO (validity, status, lines, add line)
    if (openPo && row.parent_po_id != null) {
      setPoId(row.parent_po_id)
      setMode('po')
      setSaveError(null)
      return
    }
    // Guard against a DB null overwriting EMPTY_FORM's '' default (would
    // otherwise make a controlled input briefly uncontrolled on load) --
    // e.g. an old order saved with a null qtn_no must still render/save
    // cleanly, not as a literal null value flowing into a controlled select.
    const sanitized = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v ?? '']))
    setForm({ ...EMPTY_FORM, ...sanitized })
    setMode('view')
    setSaveError(null)
  }

  // Same "never overwrite a field already filled" rule as the new-PO line
  // items -- here there's no Drawing Number field on this flat form, so
  // only Part Serial Number gets filled in when empty.
  function handleQtnChange(e) {
    const qtnNo = e.target.value
    const enquiry = enquiries.find((en) => en.qtn_no === qtnNo)
    setForm((f) => {
      const next = { ...f, qtn_no: qtnNo }
      if (enquiry && !f.part_serial_number) {
        next.part_serial_number = enquiry.part_serial_number ?? ''
      }
      return next
    })
  }

  function handleEdit() {
    if (mode !== 'view' || !form.order_line_id) return
    setMode('edit')
  }

  function handlePoHeaderField(key) {
    return (e) => setPoHeader((h) => ({ ...h, [key]: e.target.value }))
  }

  function handleLineItemField(key, lineKey) {
    return (e) => {
      const value = e.target.value
      setLineItems((items) => items.map((it) => (it.key === lineKey ? { ...it, [key]: value } : it)))
    }
  }

  function handleLineItemProductChange(lineKey) {
    return (e) => {
      const value = e.target.value
      setLineItems((items) =>
        items.map((it) => {
          if (it.key !== lineKey) return it
          if (value === NEW_PART_VALUE) {
            // Nothing to auto-fill from yet -- Part Name / Drawing Number
            // become manual entry until this part is actually created.
            return { ...it, partSerialNumber: '', isNewPart: true, partName: '', drawingNumber: '' }
          }
          const product = products.find((p) => p.part_serial_number === value)
          return {
            ...it,
            partSerialNumber: value,
            isNewPart: false,
            partName: product?.part_name ?? '',
            drawingNumber: product?.part_drawing_reference_number ?? '',
          }
        })
      )
    }
  }

  // Picking a quotation never overwrites a field already filled -- it
  // only fills Part Serial Number (and Drawing Number) from the enquiry
  // when the part hasn't been chosen yet (not already picked from the
  // dropdown, and not already mid-typing as a new part).
  function handleLineItemQtnChange(lineKey) {
    return (e) => {
      const qtnNo = e.target.value
      const enquiry = enquiries.find((en) => en.qtn_no === qtnNo)
      setLineItems((items) =>
        items.map((it) => {
          if (it.key !== lineKey) return it
          const next = { ...it, qtnNo }
          if (enquiry && !it.isNewPart && !it.partSerialNumber) {
            next.partSerialNumber = enquiry.part_serial_number ?? ''
            if (!it.partName) next.partName = enquiry.part_name ?? ''
            if (!it.drawingNumber) next.drawingNumber = enquiry.drawing_number ?? ''
          }
          return next
        })
      )
    }
  }

  function addLineItem() {
    const def = String(defaultAddressId(delivery.addresses, poHeader.customer_id) || '')
    setLineItems((items) => [...items, { ...emptyLineItem(), deliveryAddressId: def }])
  }

  function removeLineItem(lineKey) {
    setLineItems((items) => (items.length > 1 ? items.filter((it) => it.key !== lineKey) : items))
  }

  async function handleSave() {
    if (mode === 'new-po') {
      return handleSubmitPo()
    }
    // mode === 'edit': editing one existing customer orders row, unchanged
    // from before this rework.
    const missingKey = ['customer_id', 'po_number', 'po_date', 'part_serial_number', 'order_qty'].find((k) => !form[k])
    if (missingKey) {
      fieldError.fail(missingKey, 'Customer, PO Number, PO Date, Product and Order Qty are required.')
      return
    }
    const lineProblem = orderLineProblem({ orderQty: form.order_qty, poDate: form.po_date, expectedDelivery: form.expected_delivery })
    if (lineProblem) {
      fieldError.fail(lineProblem.field === 'orderQty' ? 'order_qty' : 'expected_delivery', lineProblem.error)
      return
    }
    const typeProblem = orderTypeProblem(form.order_type)
    if (typeProblem) {
      fieldError.fail('order_type', typeProblem)
      return
    }
    const savedLine = records.find((r) => r.order_line_id === form.order_line_id)
    const addrProblem = deliverToProblem({
      supported: delivery.supported,
      addresses: delivery.addresses,
      customerId: form.customer_id,
      deliveryAddressId: form.delivery_address_id,
      currentId: savedLine?.delivery_address_id ?? null,
    })
    if (addrProblem) {
      fieldError.fail('delivery_address_id', addrProblem)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const payload = withTypedFields({
        qtn_no: form.qtn_no || null,
        customer_id: form.customer_id,
        po_number: form.po_number,
        po_date: form.po_date,
        part_serial_number: form.part_serial_number,
        order_qty: form.order_qty,
        order_type: form.order_type,
        expected_delivery: form.expected_delivery,
        customer_po_line_no: form.customer_po_line_no || null,
        ...(delivery.supported ? { delivery_address_id: deliveryIdOrNull(form.delivery_address_id) } : {}),
      }, ORDER_LINE_TYPES)
      const saved = await updateCustomerOrder(form.order_line_id, payload)
      setForm({ ...EMPTY_FORM, ...form, ...Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, v ?? ''])) })
      await refresh()
      setMode('view')
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmitPo() {
    const missingHeader = ['customer_id', 'po_number', 'po_date'].find((k) => !poHeader[k])
    if (missingHeader) {
      fieldError.fail(`po.${missingHeader}`, 'Customer, PO Number and PO Date are required for the PO header.')
      return
    }
    if (openPo && poHeader.valid_to && poHeader.valid_to < (poHeader.valid_from || poHeader.po_date)) {
      fieldError.fail('po.valid_to', 'Valid To cannot be before Valid From.')
      return
    }
    const validLines = lineItems.filter((it) => it.partSerialNumber || it.isNewPart)
    if (validLines.length === 0) {
      fieldError.fail(lineItems[0] ? `line.${lineItems[0].key}.part` : null, 'At least one line item is required.')
      return
    }
    for (const it of validLines) {
      if (it.isNewPart && !it.newPartCode) {
        fieldError.fail(`line.${it.key}.part`, 'Enter a part number for the newly-typed part, or pick an existing one.')
        return
      }
      if (it.isNewPart && !it.partName) {
        fieldError.fail(`line.${it.key}.partName`, 'Part Name is required for a newly-typed part (nothing to auto-fill from yet).')
        return
      }
      if (!it.orderQty || Number(it.orderQty) <= 0) {
        fieldError.fail(`line.${it.key}.orderQty`, 'Every line item needs an Order Qty greater than 0.')
        return
      }
      const lineProblem = orderLineProblem({ orderQty: it.orderQty, poDate: poHeader.po_date, expectedDelivery: it.expectedDelivery })
      if (lineProblem) {
        fieldError.fail(`line.${it.key}.${lineProblem.field}`, lineProblem.error)
        return
      }
      const typeProblem = orderTypeProblem(it.orderType)
      if (typeProblem) {
        fieldError.fail(`line.${it.key}.orderType`, typeProblem)
        return
      }
      const addrProblem = deliverToProblem({
        supported: delivery.supported,
        addresses: delivery.addresses,
        customerId: poHeader.customer_id,
        deliveryAddressId: it.deliveryAddressId,
      })
      if (addrProblem) {
        fieldError.fail(`line.${it.key}.deliveryAddressId`, addrProblem)
        return
      }
    }

    setSaving(true)
    setSaveError(null)
    try {
      const header = await createPoHeader({
        customer_id: poHeader.customer_id,
        po_number: poHeader.po_number,
        po_date: poHeader.po_date,
        delivery_terms: poHeader.delivery_terms || null,
        payment_terms: poHeader.payment_terms || null,
        ...(openPo ? { valid_from: poHeader.valid_from || poHeader.po_date, valid_to: poHeader.valid_to || null } : {}),
      })

      // Sequential -- a newly typed part is created (and confirmed) before
      // its line. Lines get no PRD here: Production Planning creates one per
      // batch (migration 030).
      let knownProducts = products
      const createdPrds = []
      for (const it of validLines) {
        const resolved = await resolveProductWithConfirmation({
          isNewPart: it.isNewPart,
          partSerialNumber: it.partSerialNumber,
          newPartCode: it.newPartCode,
          partName: it.partName,
          drawingNumber: it.drawingNumber,
          knownProducts,
        })
        const partSerialNumber = resolved.partSerialNumber
        knownProducts = resolved.knownProducts
        const line = await createCustomerOrder(withTypedFields({
          qtn_no: it.qtnNo || null,
          customer_id: poHeader.customer_id,
          po_number: poHeader.po_number,
          po_date: poHeader.po_date,
          part_serial_number: partSerialNumber,
          order_qty: it.orderQty,
          order_type: it.orderType,
          expected_delivery: it.expectedDelivery,
          customer_po_line_no: it.customerPoLineNo || null,
          parent_po_id: header.id,
          ...(delivery.supported ? { delivery_address_id: deliveryIdOrNull(it.deliveryAddressId) } : {}),
        }, ORDER_LINE_TYPES))
        createdPrds.push(line.order_line_id)
      }

      setPoHeader(EMPTY_PO_HEADER)
      setLineItems([emptyLineItem()])
      await refresh()
      setSaveError(null)
      // No dedicated success banner component here -- the list below
      // refreshing with the new rows, plus the form resetting to blank, is
      // the existing app-wide confirmation pattern (same as every other
      // New -> Save -> list-refreshes flow).
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function handleDelete() {
    if (!form.order_line_id) return
    del.ask({ recordType: 'PO line', label: recordLabel(form.po_number, form.part_serial_number), run: doDelete })
  }

  async function doDelete() {
    if (!form.order_line_id) return
    if (mode !== 'edit' && mode !== 'view') return
    if (!form.order_line_id) return
    setSaving(true)
    setSaveError(null)
    try {
      await deleteCustomerOrder(form.order_line_id)
      await refresh()
      handleNew()
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function handleExportExcel() {
    exportToCsv(listColumns, filteredRecords, 'customer_orders.csv')
  }

  function handleExportPdf() {
    exportToPdf(listColumns, filteredRecords, 'Customer Orders', 'customer_orders')
  }

  const filteredRecords = records.map((r) => ({
    ...r,
    customer_name: customers.find((c) => c.customer_id === r.customer_id)?.customer_name ?? r.customer_id ?? '',
    part_drawing_reference_number: products.find((p) => p.part_serial_number === r.part_serial_number)?.part_drawing_reference_number ?? '',
    deliver_to: deliveryText(r, delivery.byId),
    customer_part_no: customerPartNoText(customerPartFor(cparts.map, r.customer_id, r.part_serial_number)),
    ...(openPo && lineStatus.get(r.order_line_id)
      ? {
          line_status: lineStatus.get(r.order_line_id).line_status,
          planned_text: fmtQtyIn(lineStatus.get(r.order_line_id).planned_qty),
          despatched_text: fmtQtyIn(lineStatus.get(r.order_line_id).despatched_qty),
        }
      : {}),
  })).filter((r) => {
    if (!listSearch) return true
    const q = listSearch.toLowerCase()
    return r.prds?.toLowerCase().includes(q) || r.po_number?.toLowerCase().includes(q) || r.customer_name?.toLowerCase().includes(q)
  })

  const readOnly = mode === 'view'
  const isNewPo = mode === 'new-po'

  return (
    <FieldErrorProvider value={fieldError}>
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title="New Order" subtitle="Purchase Order Stage  |  One PO, Many Line Items" />
      <ActionToolbar
        onNew={handleNew}
        onSave={handleSave}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onClear={handleClear}
        canSave={(isNewPo || mode === 'edit') && !saving}
        canEdit={mode === 'view'}
        canDelete={(mode === 'edit' || mode === 'view') && !saving}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
      />

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#F5F7FA]">
        {saveError && (
          <Banner tone="error" message={saveError} onClose={() => setSaveError(null)} />
        )}

        {mode === 'po' && poId != null ? (
          <PoView
            key={poId}
            poId={poId}
            role={role}
            cparts={cparts}
            customers={customers}
            products={products}
            delivery={delivery}
            orderLines={records}
            onChanged={refresh}
          />
        ) : isNewPo ? (
          <>
            <FormSection icon={FileStack} title="1. PO Header" subtitle="Once per real customer PO">
              <Field name="po.customer_id" label="Customer" required>
                <SearchableSelect
                  value={poHeader.customer_id}
                  onChange={handlePoCustomer}
                  options={customerDropdownOptions(customers)}
                />
              </Field>
              <Field name="po.po_number" label="PO Number" required>
                <TextInput value={poHeader.po_number} onChange={handlePoHeaderField('po_number')} />
              </Field>
              <Field name="po.po_date" label="PO Date" required>
                <TextInput type="date" value={poHeader.po_date} onChange={handlePoHeaderField('po_date')} />
              </Field>
              {openPo && (
                <>
                  <Field name="po.valid_from" label="Valid From">
                    <TextInput type="date" value={poHeader.valid_from} onChange={handlePoHeaderField('valid_from')} placeholder="= PO Date" />
                  </Field>
                  <Field name="po.valid_to" label="Valid To">
                    <TextInput type="date" value={poHeader.valid_to} onChange={handlePoHeaderField('valid_to')} />
                  </Field>
                </>
              )}
              <Field label="Delivery Terms">
                <SelectWithAddNew
                  value={poHeader.delivery_terms ?? ''}
                  onChange={handlePoHeaderField('delivery_terms')}
                  options={deliveryTermsOptions(poHeaders)}
                />
              </Field>
              <Field label="Payment Terms">
                <SelectWithAddNew
                  value={poHeader.payment_terms ?? ''}
                  onChange={handlePoHeaderField('payment_terms')}
                  options={paymentTermsOptions(poHeaders, customers)}
                />
              </Field>
            </FormSection>

            <div className="bg-white border border-gray-200 rounded-md overflow-visible">
              <div className="flex items-center gap-2 bg-bmlhsky border-b border-gray-200 px-3 py-1 rounded-t-md">
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-bmlhblue text-white text-[9px] font-bold shrink-0">
                  2
                </span>
                <ClipboardList size={12} className="text-bmlhnavy shrink-0" />
                <h2 className="text-[11px] font-semibold text-bmlhnavy truncate">Line Items</h2>
                <span className="ml-auto pl-2 text-[10px] text-gray-500 font-normal whitespace-nowrap truncate">
                  PRDs are created at Production Planning
                </span>
              </div>
              <div className="flex flex-col gap-2 p-2">
                {lineItems.map((it, idx) => (
                  <div key={it.key} className="border border-gray-200 rounded p-2 flex flex-wrap items-start gap-3">
                    <Field name={`line.${it.key}.part`} label="Part Serial Number" width="medium" required>
                      {it.isNewPart ? (
                        <TextInput
                          value={it.newPartCode ?? ''}
                          onChange={(e) =>
                            setLineItems((items) =>
                              items.map((li) => (li.key === it.key ? { ...li, newPartCode: e.target.value } : li))
                            )
                          }
                          placeholder="Type new part number"
                        />
                      ) : (
                        <SearchableSelect
                          value={it.partSerialNumber}
                          onChange={handleLineItemProductChange(it.key)}
                          options={[
                            ...productOptions(products),
                            { value: NEW_PART_VALUE, label: '+ Add New Part...' },
                          ]}
                        />
                      )}
                    </Field>
                    {it.isNewPart && (
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() =>
                            setLineItems((items) =>
                              items.map((li) =>
                                li.key === it.key ? { ...li, isNewPart: false, newPartCode: '' } : li
                              )
                            )
                          }
                          className="text-xs text-bmlhblue hover:underline"
                        >
                          Pick existing instead
                        </button>
                      </div>
                    )}
                    <Field name={`line.${it.key}.partName`} label="Part Name" width="medium">
                      <TextInput
                        value={it.partName}
                        onChange={handleLineItemField('partName', it.key)}
                        disabled={!it.isNewPart}
                      />
                    </Field>
                    <Field label="Part Drawing Number" width="medium">
                      <TextInput
                        value={it.drawingNumber}
                        onChange={handleLineItemField('drawingNumber', it.key)}
                        disabled={!it.isNewPart}
                      />
                    </Field>
                    {cparts.supported && (
                      <>
                        <Field label="Customer Part No" width="medium">
                          <AutoFillBox value={customerPartNoText(customerPartFor(cparts.map, poHeader.customer_id, it.isNewPart ? '' : it.partSerialNumber))} />
                        </Field>
                        <Field label="Customer Drawing Ref" width="medium">
                          <AutoFillBox value={customerDrawingText(customerPartFor(cparts.map, poHeader.customer_id, it.isNewPart ? '' : it.partSerialNumber))} />
                        </Field>
                      </>
                    )}
                    <Field label="Quotation (QTN)" width="medium">
                      <SearchableSelect
                        value={it.qtnNo}
                        onChange={handleLineItemQtnChange(it.key)}
                        options={enquiryOptionsForOrder({
                          enquiries,
                          customerId: poHeader.customer_id,
                          partSerialNumber: it.isNewPart ? '' : it.partSerialNumber,
                        })}
                      />
                    </Field>
                    <Field label="PO Line No." width="short">
                      <TextInput
                        value={it.customerPoLineNo}
                        onChange={handleLineItemField('customerPoLineNo', it.key)}
                      />
                    </Field>
                    <Field name={`line.${it.key}.orderType`} label="Order Type" width="medium" required>
                      <SelectInput
                        value={it.orderType}
                        onChange={handleLineItemField('orderType', it.key)}
                        options={ORDER_TYPES}
                      />
                    </Field>
                    {delivery.supported && (
                      <Field
                        name={`line.${it.key}.deliveryAddressId`}
                        label="Deliver To"
                        width="medium"
                        required={deliverToOptions(delivery.addresses, poHeader.customer_id).length > 0}
                      >
                        <SearchableSelect
                          value={String(it.deliveryAddressId ?? '')}
                          onChange={handleLineItemField('deliveryAddressId', it.key)}
                          options={deliverToOptions(delivery.addresses, poHeader.customer_id)}
                          placeholder={poHeader.customer_id ? 'Select...' : 'Pick the customer first'}
                        />
                      </Field>
                    )}
                    <Field name={`line.${it.key}.orderQty`} label="Order Qty" width="short" required>
                      <TextInput
                        type="number"
                        value={it.orderQty}
                        onChange={handleLineItemField('orderQty', it.key)}
                      />
                    </Field>
                    <Field name={`line.${it.key}.expectedDelivery`} label="Expected Delivery" width="short">
                      <TextInput
                        type="date"
                        value={it.expectedDelivery}
                        onChange={handleLineItemField('expectedDelivery', it.key)}
                      />
                    </Field>
                    {lineItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLineItem(it.key)}
                        className="text-gray-400 hover:text-red-500 mt-5"
                        title="Remove this line item"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addLineItem}
                  className="inline-flex items-center gap-1 text-xs text-bmlhblue hover:underline self-start"
                >
                  <Plus size={13} /> Add line item
                </button>
              </div>
            </div>
          </>
        ) : (
          <FormSection icon={ClipboardList} title="1. Order Details" subtitle="One line item from a PO" columns={3}>
            <Field label="PRDs">
              <AutoFillBox value={form.prds || '(created in Production Planning)'} />
            </Field>
            <Field label="Quotation (QTN)">
              <SearchableSelect
                value={form.qtn_no}
                onChange={handleQtnChange}
                disabled={readOnly}
                options={enquiryOptionsForOrder({
                  enquiries,
                  customerId: form.customer_id,
                  partSerialNumber: form.part_serial_number,
                })}
              />
            </Field>
            <Field name="customer_id" label="Customer" required>
              <SearchableSelect
                value={form.customer_id}
                onChange={handleFormCustomer}
                disabled={readOnly}
                options={customerDropdownOptions(customers)}
              />
            </Field>
            <Field name="po_number" label="PO Number" required>
              <TextInput value={form.po_number} onChange={handleField('po_number')} disabled={readOnly} />
            </Field>
            <Field name="po_date" label="PO Date" required>
              <TextInput type="date" value={form.po_date} onChange={handleField('po_date')} disabled={readOnly} />
            </Field>
            <Field name="part_serial_number" label="Product" required>
              <SearchableSelect
                value={form.part_serial_number}
                onChange={handleField('part_serial_number')}
                disabled={readOnly}
                options={productOptions(products)}
              />
            </Field>
            {cparts.supported && (
              <>
                <Field label="Customer Part No">
                  <AutoFillBox value={customerPartNoText(customerPartFor(cparts.map, form.customer_id, form.part_serial_number))} />
                </Field>
                <Field label="Customer Drawing Ref">
                  <AutoFillBox value={customerDrawingText(customerPartFor(cparts.map, form.customer_id, form.part_serial_number))} />
                </Field>
              </>
            )}
            <Field name="order_type" label="Order Type" required>
              <SelectInput
                value={form.order_type}
                onChange={handleField('order_type')}
                disabled={readOnly}
                options={ORDER_TYPES}
              />
            </Field>
            {delivery.supported && (
              <Field name="delivery_address_id" label="Deliver To">
                <SearchableSelect
                  value={String(form.delivery_address_id ?? '')}
                  onChange={handleField('delivery_address_id')}
                  disabled={readOnly}
                  options={deliverToOptions(
                    delivery.addresses,
                    form.customer_id,
                    records.find((r) => r.order_line_id === form.order_line_id)?.delivery_address_id ?? null,
                  )}
                />
              </Field>
            )}
            <Field label="PO Line No.">
              <TextInput
                value={form.customer_po_line_no}
                onChange={handleField('customer_po_line_no')}
                disabled={readOnly}
              />
            </Field>
            <Field name="order_qty" label="Order Qty" required>
              <TextInput type="number" value={form.order_qty} onChange={handleField('order_qty')} disabled={readOnly} />
            </Field>
            <Field name="expected_delivery" label="Expected Delivery">
              <TextInput
                type="date"
                value={form.expected_delivery}
                onChange={handleField('expected_delivery')}
                disabled={readOnly}
              />
            </Field>
          </FormSection>
        )}

        <RecordsList
          title="Customer Orders List"
          columns={listColumns}
          rows={filteredRecords}
          loading={loading}
          error={error}
          rowKey="order_line_id"
          selectedKey={form.order_line_id}
          onRowClick={handleRowClick}
          searchValue={listSearch}
          onSearchChange={setListSearch} searchPlaceholder="Search by PRD / PO Number / Customer..."
        />
      </div>
      {del.dialog}
    </div>
    </FieldErrorProvider>
  )
}
