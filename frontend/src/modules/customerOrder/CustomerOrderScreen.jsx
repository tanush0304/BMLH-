import { exportToCsv, exportToPdf } from '../../utils/exportUtils'
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
  generateNextPrdNo,
} from '../../data/queries/customerOrders'
import { createPoHeader } from '../../data/queries/customerPoHeaders'
import { listCustomerEnquiries } from '../../data/queries/customerEnquiries'
import { listCustomers } from '../../data/queries/customers'
import { listProducts, resolveProductWithConfirmation } from '../../data/queries/products'
import { customerDropdownOptions } from '../../utils/customerLabel'
import { enquiryOptionsForOrder } from '../../utils/qtnOption'

const EMPTY_FORM = {
  prd_no: '',
  qtn_no: '',
  customer_id: '',
  po_number: '',
  po_date: '',
  part_serial_number: '',
  order_qty: '',
  order_type: '',
  expected_delivery: '',
  customer_po_line_no: '',
}

const EMPTY_PO_HEADER = {
  customer_id: '',
  po_number: '',
  po_date: '',
  delivery_terms: '',
  payment_terms: '',
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
    orderType: '',
    orderQty: '',
    expectedDelivery: '',
    customerPoLineNo: '',
  }
}

const LIST_COLUMNS = [
  { key: 'prd_no', label: 'PRD No' },
  { key: 'customer_id', label: 'Customer' },
  { key: 'po_number', label: 'PO Number' },
  { key: 'part_serial_number', label: 'Part Serial Number' },
  { key: 'order_qty', label: 'Order Qty' },
  { key: 'expected_delivery', label: 'Expected Delivery' },
]

export default function CustomerOrderScreen() {
  const [records, setRecords] = useState([])
  const [enquiries, setEnquiries] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [listSearch, setListSearch] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  // 'view' / 'edit' operate on one existing customer orders row, exactly as
  // before this rework. 'new-po' is the new two-level flow -- its own form
  // state below, kept separate so it never cross-contaminates the
  // single-row form.
  const [mode, setMode] = useState('new-po')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const [poHeader, setPoHeader] = useState(EMPTY_PO_HEADER)
  const [lineItems, setLineItems] = useState([emptyLineItem()])

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [orders, enq, custs, prods] = await Promise.all([
        listCustomerOrders(),
        listCustomerEnquiries(),
        listCustomers(),
        listProducts(),
      ])
      setRecords(orders)
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
    if (mode !== 'view' || !form.prd_no) return
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
    setLineItems((items) => [...items, emptyLineItem()])
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
    if (!form.customer_id || !form.po_number || !form.po_date || !form.part_serial_number || !form.order_qty) {
      setSaveError('Customer, PO Number, PO Date, Product and Order Qty are required.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const payload = {
        qtn_no: form.qtn_no || null,
        customer_id: form.customer_id,
        po_number: form.po_number,
        po_date: form.po_date,
        part_serial_number: form.part_serial_number,
        order_qty: Number(form.order_qty),
        order_type: form.order_type || null,
        expected_delivery: form.expected_delivery || null,
        customer_po_line_no: form.customer_po_line_no || null,
      }
      const saved = await updateCustomerOrder(form.prd_no, payload)
      setForm({ ...EMPTY_FORM, ...saved })
      await refresh()
      setMode('view')
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmitPo() {
    if (!poHeader.customer_id || !poHeader.po_number || !poHeader.po_date) {
      setSaveError('Customer, PO Number and PO Date are required for the PO header.')
      return
    }
    const validLines = lineItems.filter((it) => it.partSerialNumber || it.isNewPart)
    if (validLines.length === 0) {
      setSaveError('At least one line item is required.')
      return
    }
    for (const it of validLines) {
      if (it.isNewPart && !it.newPartCode) {
        setSaveError('Enter a part number for the newly-typed part, or pick an existing one.')
        return
      }
      if (it.isNewPart && !it.partName) {
        setSaveError('Part Name is required for a newly-typed part (nothing to auto-fill from yet).')
        return
      }
      if (!it.orderQty || Number(it.orderQty) <= 0) {
        setSaveError('Every line item needs an Order Qty greater than 0.')
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
      })

      // Sequential, not Promise.all -- generateNextPrdNo computes "max + 1"
      // from what's already committed, so parallel calls could compute the
      // same next number for two different lines.
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
        const prdNo = await generateNextPrdNo()
        await createCustomerOrder({
          prd_no: prdNo,
          qtn_no: it.qtnNo || null,
          customer_id: poHeader.customer_id,
          po_number: poHeader.po_number,
          po_date: poHeader.po_date,
          part_serial_number: partSerialNumber,
          order_qty: Number(it.orderQty),
          order_type: it.orderType || null,
          expected_delivery: it.expectedDelivery || null,
          customer_po_line_no: it.customerPoLineNo || null,
          parent_po_id: header.id,
        })
        createdPrds.push(prdNo)
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

  async function handleDelete() {
    if (mode !== 'edit' && mode !== 'view') return
    if (!form.prd_no) return
    if (!confirm(`Delete order ${form.prd_no}? This cannot be undone.`)) return
    setSaving(true)
    setSaveError(null)
    try {
      await deleteCustomerOrder(form.prd_no)
      await refresh()
      handleNew()
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function handleExportExcel() {
    exportToCsv(LIST_COLUMNS, filteredRecords, 'customer_orders.csv')
  }

  function handleExportPdf() {
    exportToPdf(LIST_COLUMNS, filteredRecords, 'Customer Orders', 'customer_orders')
  }

  const filteredRecords = records.filter((r) => {
    if (!listSearch) return true
    const q = listSearch.toLowerCase()
    return r.prd_no?.toLowerCase().includes(q) || r.po_number?.toLowerCase().includes(q)
  })

  const readOnly = mode === 'view'
  const isNewPo = mode === 'new-po'

  return (
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
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {saveError}
          </div>
        )}

        {isNewPo ? (
          <>
            <FormSection icon={FileStack} title="1. PO Header" subtitle="Once per real customer PO">
              <Field label="Customer" required>
                <SearchableSelect
                  value={poHeader.customer_id}
                  onChange={handlePoHeaderField('customer_id')}
                  options={customerDropdownOptions(customers)}
                />
              </Field>
              <Field label="PO Number" required>
                <TextInput value={poHeader.po_number} onChange={handlePoHeaderField('po_number')} />
              </Field>
              <Field label="PO Date" required>
                <TextInput type="date" value={poHeader.po_date} onChange={handlePoHeaderField('po_date')} />
              </Field>
              <Field label="Delivery Terms">
                <TextInput value={poHeader.delivery_terms} onChange={handlePoHeaderField('delivery_terms')} />
              </Field>
              <Field label="Payment Terms">
                <TextInput value={poHeader.payment_terms} onChange={handlePoHeaderField('payment_terms')} />
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
                  One PRD will be generated per line
                </span>
              </div>
              <div className="flex flex-col gap-2 p-2">
                {lineItems.map((it, idx) => (
                  <div key={it.key} className="border border-gray-200 rounded p-2 flex flex-wrap items-start gap-3">
                    <Field label="Part Serial Number" width="medium" required>
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
                    <Field label="Part Name" width="medium">
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
                    <Field label="Order Type" width="short">
                      <SelectInput
                        value={it.orderType}
                        onChange={handleLineItemField('orderType', it.key)}
                        options={['Labour', 'Manufacturing']}
                      />
                    </Field>
                    <Field label="Order Qty" width="short" required>
                      <TextInput
                        type="number"
                        value={it.orderQty}
                        onChange={handleLineItemField('orderQty', it.key)}
                      />
                    </Field>
                    <Field label="Expected Delivery" width="short">
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
            <Field label="PRD No">
              <AutoFillBox value={form.prd_no || '(auto-generated on save)'} />
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
            <Field label="Customer" required>
              <SearchableSelect
                value={form.customer_id}
                onChange={handleField('customer_id')}
                disabled={readOnly}
                options={customerDropdownOptions(customers)}
              />
            </Field>
            <Field label="PO Number" required>
              <TextInput value={form.po_number} onChange={handleField('po_number')} disabled={readOnly} />
            </Field>
            <Field label="PO Date" required>
              <TextInput type="date" value={form.po_date} onChange={handleField('po_date')} disabled={readOnly} />
            </Field>
            <Field label="Product" required>
              <SearchableSelect
                value={form.part_serial_number}
                onChange={handleField('part_serial_number')}
                disabled={readOnly}
                options={productOptions(products)}
              />
            </Field>
            <Field label="Order Type">
              <SelectInput
                value={form.order_type}
                onChange={handleField('order_type')}
                disabled={readOnly}
                options={['Labour', 'Manufacturing']}
              />
            </Field>
            <Field label="PO Line No.">
              <TextInput
                value={form.customer_po_line_no}
                onChange={handleField('customer_po_line_no')}
                disabled={readOnly}
              />
            </Field>
            <Field label="Order Qty" required>
              <TextInput type="number" value={form.order_qty} onChange={handleField('order_qty')} disabled={readOnly} />
            </Field>
            <Field label="Expected Delivery">
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
          columns={LIST_COLUMNS}
          rows={filteredRecords}
          loading={loading}
          error={error}
          rowKey="prd_no"
          selectedKey={form.prd_no}
          onRowClick={handleRowClick}
          searchValue={listSearch}
          onSearchChange={setListSearch} searchPlaceholder="Search by PRD No / PO Number..."
        />
      </div>
    </div>
  )
}
