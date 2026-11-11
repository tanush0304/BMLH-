import { User, Phone, Home, MapPin, FileText, Landmark } from 'lucide-react'
import { YES_NO_OPTIONS } from '../../utils/numericFields'
import MasterFormScreen from '../../components/MasterFormScreen'
import DeliveryAddressesSection from './DeliveryAddressesSection'
import CustomerProductsSection from './CustomerProductsSection'
import { useDeliverySupported } from '../../components/OrderLineFields'
import { MASTER_PAYMENT_TERMS } from '../../utils/poTermsOptions'
import {
  listCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from '../../data/queries/customers'

const EMPTY_FORM = {
  customer_id: '',
  customer_name: '',
  contact_person_name: '',
  mobile_number: '',
  email_address: '',
  alternate_contact_number: '',
  registered_address: '',
  registered_city: '',
  registered_state: '',
  registered_pincode: '',
  registered_country: '',
  delivery_address: '',
  delivery_city: '',
  delivery_state: '',
  delivery_pincode: '',
  delivery_country: '',
  gstin_number: '',
  pan_number: '',
  msme_udyam_no: '',
  gst_registered: '',
  payment_terms: '',
  credit_period: '',
  currency: '',
  status: '',
}

const SECTIONS = [
  {
    icon: User,
    title: '1. Customer Details',
    subtitle: 'Primary identification details',
    columns: 2,
    width: 'narrow',
    fields: [
      { key: 'customer_id', label: 'Customer ID', required: true, lockOnEdit: true, width: 'short' },
      { key: 'customer_name', label: 'Customer Name', required: true, width: 'short' },
    ],
  },
  {
    icon: Phone,
    title: '2. Contact Information',
    subtitle: 'Communication details',
    width: 'wide',
    fields: [
      { key: 'contact_person_name', label: 'Contact Person Name', required: true, width: 'short' },
      { key: 'mobile_number', label: 'Mobile Number', mobile: true, width: 'short' },
      { key: 'email_address', label: 'Email Address', required: true, type: 'email', width: 'short' },
      { key: 'alternate_contact_number', label: 'Alternate Contact Number', width: 'short' },
    ],
  },
  {
    icon: Home,
    title: '3. Registered Address',
    subtitle: 'Official registered address',
    width: 'full',
    fields: [
      { key: 'registered_address', label: 'Address', required: true, colSpan: 'lg:col-span-2' },
      { key: 'registered_city', label: 'City', required: true },
      { key: 'registered_state', label: 'State', required: true },
      { key: 'registered_pincode', label: 'Pincode', width: 'short' },
      { key: 'registered_country', label: 'Country' },
    ],
  },
  {
    icon: MapPin,
    title: '4. Delivery Location',
    subtitle: 'Where goods are shipped',
    width: 'full',
    fields: [
      { key: 'delivery_address', label: 'Address', required: true, colSpan: 'lg:col-span-2' },
      { key: 'delivery_city', label: 'City', required: true },
      { key: 'delivery_state', label: 'State', required: true },
      { key: 'delivery_pincode', label: 'Pincode', width: 'short' },
      { key: 'delivery_country', label: 'Country' },
    ],
  },
  {
    icon: FileText,
    title: '5. Statutory Details',
    subtitle: 'Tax and compliance identifiers',
    width: 'half',
    fields: [
      { key: 'gstin_number', label: 'GSTIN Number', width: 'tiny' },
      { key: 'pan_number', label: 'PAN Number', width: 'tiny' },
      { key: 'msme_udyam_no', label: 'MSME / Udyam No.', width: 'tiny' },
      { key: 'gst_registered', label: 'GST Registered', type: 'select', options: YES_NO_OPTIONS, width: 'tiny' },
    ],
  },
  {
    icon: Landmark,
    title: '6. Commercial Details',
    subtitle: 'Payment and currency terms',
    width: 'half',
    fields: [
      {
        key: 'payment_terms',
        label: 'Payment Terms',
        required: true,
        type: 'addNew',
        options: MASTER_PAYMENT_TERMS,
        width: 'short',
      },
      { key: 'credit_period', label: 'Credit Period', type: 'addNew', options: MASTER_PAYMENT_TERMS, width: 'short' },
      { key: 'currency', label: 'Currency', required: true, type: 'select', options: ['INR', 'USD', 'EURO'], width: 'short' },
      { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], width: 'short' },
    ],
  },
]
// Section 7 "Customer Product & Drawing Details" was removed (2026-11-11):
// a product's customer now lives on Product Master (045). The four DB
// columns are KEPT and never sent on save, so their old values stay.

const LIST_COLUMNS = [
  { key: 'customer_id', label: 'Customer ID' },
  { key: 'customer_name', label: 'Customer Name' },
  { key: 'contact_person_name', label: 'Contact Person' },
  { key: 'mobile_number', label: 'Mobile Number' },
  { key: 'email_address', label: 'Email Address' },
  { key: 'registered_city', label: 'City' },
  { key: 'registered_state', label: 'State' },
  { key: 'status', label: 'Status', type: 'status' },
]

// Old section-7 columns: never sent (the form loads the whole row, so they
// are stripped here to leave the stored values untouched).
export const LEGACY_SECTION7_KEYS = ['customer_product_part_number', 'customer_product_part_name', 'customer_drawing_ref_no', 'revision_drawing_no']

export function withoutLegacySection7(payload) {
  const out = { ...payload }
  for (const k of LEGACY_SECTION7_KEYS) delete out[k]
  return out
}

const API = {
  list: listCustomers,
  create: (payload) => createCustomer(withoutLegacySection7(payload)),
  update: (pk, payload) => updateCustomer(pk, withoutLegacySection7(payload)),
  remove: deleteCustomer,
}

export default function CustomerMaster() {
  const addressesShown = useDeliverySupported() // number the products card after Delivery Addresses only when shown
  return (
    <MasterFormScreen
      title="Customer Master"
      subtitle="Manage Customer Information  |  Build Stronger Relationships"
      pkField="customer_id"
      recordType="customer"
      nameField="customer_name"
      emptyForm={EMPTY_FORM}
      sections={SECTIONS}
      listColumns={LIST_COLUMNS}
      searchFields={['customer_id', 'customer_name']}
      api={API}
      exportFilename="customer_master.csv"
      renderAfterSections={({ form, mode, nextNumber }) => (
        <>
          <DeliveryAddressesSection customerId={form.customer_id} mode={mode} sectionNumber={nextNumber} />
          <CustomerProductsSection customerId={form.customer_id} mode={mode} sectionNumber={nextNumber + (addressesShown ? 1 : 0)} />
        </>
      )}
    />
  )
}
