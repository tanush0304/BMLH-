import { User, Phone, Home, MapPin, FileText, Landmark, Settings } from 'lucide-react'
import MasterFormScreen from '../../components/MasterFormScreen'
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
  currency: '',
  customer_product_part_number: '',
  customer_product_part_name: '',
  customer_drawing_ref_no: '',
  revision_drawing_no: '',
  status: '',
}

const SECTIONS = [
  {
    icon: User,
    title: '1. Customer Details',
    columns: 2,
    fields: [
      { key: 'customer_id', label: 'Customer ID', required: true, lockOnEdit: true },
      { key: 'customer_name', label: 'Customer Name', required: true },
    ],
  },
  {
    icon: Phone,
    title: '2. Contact Information',
    fields: [
      { key: 'contact_person_name', label: 'Contact Person Name', required: true },
      { key: 'mobile_number', label: 'Mobile Number', required: true },
      { key: 'email_address', label: 'Email Address', required: true, type: 'email' },
      { key: 'alternate_contact_number', label: 'Alternate Contact Number' },
    ],
  },
  {
    icon: Home,
    title: '3. Registered Address',
    fields: [
      { key: 'registered_address', label: 'Address', required: true, colSpan: 'lg:col-span-2' },
      { key: 'registered_city', label: 'City', required: true },
      { key: 'registered_state', label: 'State', required: true },
      { key: 'registered_pincode', label: 'Pincode' },
      { key: 'registered_country', label: 'Country' },
    ],
  },
  {
    icon: MapPin,
    title: '4. Delivery Location',
    fields: [
      { key: 'delivery_address', label: 'Address', required: true, colSpan: 'lg:col-span-2' },
      { key: 'delivery_city', label: 'City', required: true },
      { key: 'delivery_state', label: 'State', required: true },
      { key: 'delivery_pincode', label: 'Pincode' },
      { key: 'delivery_country', label: 'Country' },
    ],
  },
  {
    icon: FileText,
    title: '5. Statutory Details',
    fields: [
      { key: 'gstin_number', label: 'GSTIN Number' },
      { key: 'pan_number', label: 'PAN Number' },
      { key: 'msme_udyam_no', label: 'MSME / Udyam No.' },
      { key: 'gst_registered', label: 'GST Registered', type: 'select', options: ['true', 'false'] },
    ],
  },
  {
    icon: Landmark,
    title: '6. Commercial Details',
    fields: [
      {
        key: 'payment_terms',
        label: 'Payment Terms',
        required: true,
        type: 'select',
        options: ['30 Days', '45 Days', '60 Days'],
      },
      { key: 'currency', label: 'Currency', required: true, type: 'select', options: ['INR', 'USD', 'EURO'] },
      { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'] },
    ],
  },
  {
    icon: Settings,
    title: '7. Customer Product & Drawing Details',
    fields: [
      { key: 'customer_product_part_number', label: 'Customer Product Part Number' },
      { key: 'customer_drawing_ref_no', label: 'Customer Drawing Reference No', required: true },
      { key: 'customer_product_part_name', label: 'Customer Product Part Name' },
      { key: 'revision_drawing_no', label: 'Revision Drawing No' },
    ],
  },
]

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

export default function CustomerMaster() {
  return (
    <MasterFormScreen
      title="Customer Master"
      subtitle="Manage Customer Information  |  Build Stronger Relationships"
      pkField="customer_id"
      emptyForm={EMPTY_FORM}
      sections={SECTIONS}
      listColumns={LIST_COLUMNS}
      searchFields={['customer_id', 'customer_name']}
      api={{ list: listCustomers, create: createCustomer, update: updateCustomer, remove: deleteCustomer }}
      exportFilename="customer_master.csv"
    />
  )
}
