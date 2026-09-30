import { Clock } from 'lucide-react'
import MasterFormScreen from '../../components/MasterFormScreen'
import { listShifts, createShift, updateShift, deleteShift } from '../../data/queries/shifts'

const EMPTY_FORM = {
  shift_code: '',
  shift_name: '',
  start_time: '',
  end_time: '',
  shift_duration: '',
  lunch_break_duration: '',
  net_working_hours: '',
}

const SECTIONS = [
  {
    icon: Clock,
    title: '1. Shift Details',
    width: 'full',
    columns: 2,
    fields: [
      { key: 'shift_code', label: 'Shift Code', required: true, lockOnEdit: true },
      { key: 'shift_name', label: 'Shift Name', required: true },
      { key: 'start_time', label: 'Start Time' },
      { key: 'end_time', label: 'End Time' },
      { key: 'shift_duration', label: 'Shift Duration' },
      { key: 'lunch_break_duration', label: 'Lunch Break Duration' },
      { key: 'net_working_hours', label: 'Net Working Hours' },
    ],
  },
]

const LIST_COLUMNS = [
  { key: 'shift_code', label: 'Shift Code' },
  { key: 'shift_name', label: 'Shift Name' },
  { key: 'start_time', label: 'Start Time' },
  { key: 'end_time', label: 'End Time' },
  { key: 'net_working_hours', label: 'Net Working Hours' },
]

export default function ShiftMaster() {
  return (
    <MasterFormScreen
      title="Shift Master"
      subtitle="Manage Shift Schedules  |  Working Hours & Breaks"
      pkField="shift_code"
      emptyForm={EMPTY_FORM}
      sections={SECTIONS}
      listColumns={LIST_COLUMNS}
      searchFields={['shift_code', 'shift_name']}
      api={{ list: listShifts, create: createShift, update: updateShift, remove: deleteShift }}
      exportFilename="shift_master.csv"
    />
  )
}
