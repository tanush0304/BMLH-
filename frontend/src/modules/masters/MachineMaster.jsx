import { Factory, Cog } from 'lucide-react'
import MasterFormScreen from '../../components/MasterFormScreen'
import { listMachines, createMachine, updateMachine, deleteMachine } from '../../data/queries/machines'

const EMPTY_FORM = {
  machine_id: '',
  machine_name: '',
  machine_oem: '',
  category: '',
  machine_type: '',
  make: '',
  model: '',
  serial_no: '',
}

// Nature-of-operation tagging (machine can perform several) lives in the
// separate "machine ops" junction table — not yet surfaced in this screen.
const SECTIONS = [
  {
    icon: Factory,
    title: '1. Machine Details',
    fields: [
      { key: 'machine_id', label: 'Machine ID', required: true, lockOnEdit: true },
      { key: 'machine_name', label: 'Machine Name', required: true },
      { key: 'machine_oem', label: 'Machine OEM' },
      {
        key: 'category',
        label: 'Category',
        type: 'select',
        options: ['Cutting', 'CNC Turning', 'VMC', 'Grinding'],
      },
    ],
  },
  {
    icon: Cog,
    title: '2. Asset Details',
    fields: [
      { key: 'machine_type', label: 'Machine Type' },
      { key: 'make', label: 'Make' },
      { key: 'model', label: 'Model' },
      { key: 'serial_no', label: 'Serial No' },
    ],
  },
]

const LIST_COLUMNS = [
  { key: 'machine_id', label: 'Machine ID' },
  { key: 'machine_name', label: 'Machine Name' },
  { key: 'category', label: 'Category' },
  { key: 'machine_oem', label: 'OEM' },
  { key: 'make', label: 'Make' },
  { key: 'model', label: 'Model' },
]

export default function MachineMaster() {
  return (
    <MasterFormScreen
      title="Machine Master"
      subtitle="Manage Machine Inventory  |  Track Assets & Capabilities"
      pkField="machine_id"
      emptyForm={EMPTY_FORM}
      sections={SECTIONS}
      listColumns={LIST_COLUMNS}
      searchFields={['machine_id', 'machine_name']}
      api={{ list: listMachines, create: createMachine, update: updateMachine, remove: deleteMachine }}
      exportFilename="machine_master.csv"
    />
  )
}
