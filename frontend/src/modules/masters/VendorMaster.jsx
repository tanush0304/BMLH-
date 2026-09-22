import { Truck as TruckIcon, Phone, Landmark } from 'lucide-react'
import MasterFormScreen from '../../components/MasterFormScreen'
import { listVendors, createVendor, updateVendor, deleteVendor } from '../../data/queries/vendors'

const EMPTY_FORM = {
  vendor_id: '',
  vendor_name: '',
  vendor_address: '',
  contact_person_name: '',
  mobile_no: '',
  email_id: '',
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

// Which job work types a vendor performs (Heat Treatment, Broaching, etc.)
// lives in the separate "vendor job work types" junction table -- not yet
// surfaced in this screen, same as Machine Master's operations tagging.
const SECTIONS = [
  {
    icon: TruckIcon,
    title: '1. Vendor Details',
    columns: 2,
    fields: [
      { key: 'vendor_id', label: 'Vendor ID', required: true, lockOnEdit: true },
      { key: 'vendor_name', label: 'Vendor Name', required: true },
      { key: 'vendor_address', label: 'Address', colSpan: 'sm:col-span-2' },
    ],
  },
  {
    icon: Phone,
    title: '2. Contact Information',
    fields: [
      { key: 'contact_person_name', label: 'Contact Person Name' },
      { key: 'mobile_no', label: 'Mobile Number' },
      { key: 'email_id', label: 'Email Address', type: 'email' },
    ],
  },
  {
    icon: Landmark,
    title: '3. Statutory & Commercial Details',
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
  { key: 'vendor_id', label: 'Vendor ID' },
  { key: 'vendor_name', label: 'Vendor Name' },
  { key: 'contact_person_name', label: 'Contact Person' },
  { key: 'mobile_no', label: 'Mobile Number' },
  { key: 'gst_category', label: 'GST Category' },
]

export default function VendorMaster() {
  return (
    <MasterFormScreen
      title="Vendor Master"
      subtitle="Manage Vendor Information  |  Outsourcing Partners"
      pkField="vendor_id"
      emptyForm={EMPTY_FORM}
      sections={SECTIONS}
      listColumns={LIST_COLUMNS}
      searchFields={['vendor_id', 'vendor_name']}
      api={{ list: listVendors, create: createVendor, update: updateVendor, remove: deleteVendor }}
      exportFilename="vendor_master.csv"
    />
  )
}
