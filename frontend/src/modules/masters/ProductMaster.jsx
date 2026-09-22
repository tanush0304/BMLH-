import { Package, Tags } from 'lucide-react'
import MasterFormScreen from '../../components/MasterFormScreen'
import { listProducts, createProduct, updateProduct, deleteProduct } from '../../data/queries/products'

const EMPTY_FORM = {
  product_code: '',
  product_name: '',
  product_category: '',
  product_type: '',
  unit_of_measurement: '',
  product_status: '',
}

const SECTIONS = [
  {
    icon: Package,
    title: '1. Product Details',
    columns: 2,
    fields: [
      { key: 'product_code', label: 'Product Code', required: true, lockOnEdit: true },
      { key: 'product_name', label: 'Product Name', required: true },
    ],
  },
  {
    icon: Tags,
    title: '2. Classification',
    columns: 2,
    fields: [
      {
        key: 'product_category',
        label: 'Product Category',
        type: 'select',
        options: ['Component', 'Assembly', 'Finished Product'],
      },
      {
        key: 'product_type',
        label: 'Product Type',
        type: 'select',
        options: ['Standard', 'Customer-specific'],
      },
      { key: 'unit_of_measurement', label: 'Unit of Measurement' },
      {
        key: 'product_status',
        label: 'Product Status',
        type: 'select',
        options: ['Active', 'Inactive', 'Obsolete'],
      },
    ],
  },
]

const LIST_COLUMNS = [
  { key: 'product_code', label: 'Product Code' },
  { key: 'product_name', label: 'Product Name' },
  { key: 'product_category', label: 'Category' },
  { key: 'product_type', label: 'Type' },
  { key: 'unit_of_measurement', label: 'UoM' },
  { key: 'product_status', label: 'Status', type: 'status' },
]

export default function ProductMaster() {
  return (
    <MasterFormScreen
      title="Product Master"
      subtitle="Manage Product Information  |  Track Category, Type & Status"
      pkField="product_code"
      emptyForm={EMPTY_FORM}
      sections={SECTIONS}
      listColumns={LIST_COLUMNS}
      searchFields={['product_code', 'product_name']}
      api={{ list: listProducts, create: createProduct, update: updateProduct, remove: deleteProduct }}
      exportFilename="product_master.csv"
    />
  )
}
