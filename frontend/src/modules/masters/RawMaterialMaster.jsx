import { Boxes, Ruler } from 'lucide-react'
import MasterFormScreen from '../../components/MasterFormScreen'
import {
  listRawMaterials,
  createRawMaterial,
  updateRawMaterial,
  deleteRawMaterial,
} from '../../data/queries/rawMaterials'

const EMPTY_FORM = {
  raw_material_code: '',
  raw_material_name: '',
  raw_material_category: '',
  rm_type: '',
  diameter_mm: '',
  length_mtrs: '',
  width: '',
  thickness: '',
  unit_of_measurement: '',
}

const SECTIONS = [
  {
    icon: Boxes,
    title: '1. Material Details',
    fields: [
      { key: 'raw_material_code', label: 'Raw Material Code', required: true, lockOnEdit: true },
      { key: 'raw_material_name', label: 'Raw Material Name', required: true },
      {
        key: 'raw_material_category',
        label: 'Category',
        type: 'select',
        options: ['Steel', 'Aluminium', 'Alloy', 'Consumables'],
      },
      {
        key: 'rm_type',
        label: 'Type',
        type: 'select',
        options: ['Bar', 'Sheet', 'Plate', 'Casting', 'Forging', 'Consumable'],
      },
    ],
  },
  {
    icon: Ruler,
    title: '2. Dimensions',
    fields: [
      { key: 'diameter_mm', label: 'Diameter (mm)' },
      { key: 'length_mtrs', label: 'Length (mtrs)', type: 'number' },
      { key: 'width', label: 'Width', type: 'number' },
      { key: 'thickness', label: 'Thickness', type: 'number' },
      { key: 'unit_of_measurement', label: 'Unit of Measurement' },
    ],
  },
]

const LIST_COLUMNS = [
  { key: 'raw_material_code', label: 'RM Code' },
  { key: 'raw_material_name', label: 'RM Name' },
  { key: 'raw_material_category', label: 'Category' },
  { key: 'rm_type', label: 'Type' },
  { key: 'unit_of_measurement', label: 'UoM' },
]

export default function RawMaterialMaster() {
  return (
    <MasterFormScreen
      title="Raw Material Master"
      subtitle="Manage Raw Material Inventory  |  Track Type & Dimensions"
      pkField="raw_material_code"
      emptyForm={EMPTY_FORM}
      sections={SECTIONS}
      listColumns={LIST_COLUMNS}
      searchFields={['raw_material_code', 'raw_material_name']}
      api={{
        list: listRawMaterials,
        create: createRawMaterial,
        update: updateRawMaterial,
        remove: deleteRawMaterial,
      }}
      exportFilename="raw_material_master.csv"
    />
  )
}
