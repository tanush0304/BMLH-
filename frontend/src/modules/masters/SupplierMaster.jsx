import { Truck as TruckIcon, Phone, Landmark } from 'lucide-react'
import MasterFormScreen from '../../components/MasterFormScreen'
import { listSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../../data/queries/suppliers'

const EMPTY_FORM = {
  supplier_id: '',
  supplier_name: '',
  supplier_address: '',
  contact_person_name: '',
  mobile_number: '',
  email_address: '',
  alternate_contact_number: '',
  gstin_no: '',
  pan_no: '',
  udyam_msme_no: '',
  gst_category: '',
  tds_applicable: '',
  payment_terms: '',
  credit_period: '',
  bank_account_no: '',
  bank_name: '',
  ifsc_code: '',
}

// Per-material MOQ/lead-time/price linkage lives in the separate "rm
// suppliers" junction table (a supplier can quote several raw materials,
// each with its own terms) -- not yet surfaced in this screen.
const SECTIONS = [
  {
    icon: TruckIcon,
    title: '1. Supplier Details',
    subtitle: 'Core supplier identity',
    columns: 2,
    width: 'half',
    fields: [
      { key: 'supplier_id', label: 'Supplier ID', required: true, lockOnEdit: true },
      { key: 'supplier_name', label: 'Supplier Name', required: true },
      { key: 'supplier_address', label: 'Address', colSpan: 'sm:col-span-2' },
    ],
  },
  {
    icon: Phone,
    title: '2. Contact Information',
    subtitle: 'Communication details',
    width: 'half',
    fields: [
      { key: 'contact_person_name', label: 'Contact Person Name' },
      { key: 'mobile_number', label: 'Mobile Number' },
      { key: 'email_address', label: 'Email Address', type: 'email' },
      { key: 'alternate_contact_number', label: 'Alternate Contact Number' },
    ],
  },
  {
    icon: Landmark,
    title: '3. Statutory & Commercial Details',
    subtitle: 'Tax IDs and payment terms',
    width: 'full',
    fields: [
      { key: 'gstin_no', label: 'GSTIN No' },
      { key: 'pan_no', label: 'PAN No' },
      { key: 'udyam_msme_no', label: 'MSME / Udyam No' },
      {
        key: 'gst_category',
        label: 'GST Category',
        type: 'select',
        options: ['Registered', 'Unregistered', 'Composition'],
      },
      { key: 'tds_applicable', label: 'TDS Applicable', type: 'select', options: ['true', 'false'] },
      { key: 'payment_terms', label: 'Payment Terms', type: 'select', options: ['30 Days', '60 Days', '90 Days'] },
      { key: 'credit_period', label: 'Credit Period' },
      { key: 'bank_account_no', label: 'Bank Account No' },
      { key: 'bank_name', label: 'Bank Name' },
      { key: 'ifsc_code', label: 'IFSC Code' },
    ],
  },
]

const LIST_COLUMNS = [
  { key: 'supplier_id', label: 'Supplier ID' },
  { key: 'supplier_name', label: 'Supplier Name' },
  { key: 'contact_person_name', label: 'Contact Person' },
  { key: 'mobile_number', label: 'Mobile Number' },
  { key: 'gst_category', label: 'GST Category' },
]

export default function SupplierMaster() {
  return (
    <MasterFormScreen
      title="Supplier Master"
      subtitle="Manage Supplier Information  |  Raw Material Sourcing Partners"
      pkField="supplier_id"
      emptyForm={EMPTY_FORM}
      sections={SECTIONS}
      listColumns={LIST_COLUMNS}
      searchFields={['supplier_id', 'supplier_name']}
      api={{ list: listSuppliers, create: createSupplier, update: updateSupplier, remove: deleteSupplier }}
      exportFilename="supplier_master.csv"
    />
  )
}
