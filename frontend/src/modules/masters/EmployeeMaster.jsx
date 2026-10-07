import { ContactRound } from 'lucide-react'
import MasterFormScreen from '../../components/MasterFormScreen'
import { listEmployees, createEmployee, updateEmployee, deleteEmployee } from '../../data/queries/employees'

const EMPTY_FORM = {
  employee_id: '',
  employee_name: '',
  department: '',
  designation: '',
  employee_type: '',
  joining_date: '',
  employee_status: '',
}

const SECTIONS = [
  {
    icon: ContactRound,
    title: '1. Employee Details',
    subtitle: 'Employee identity and role',
    width: 'full',
    fields: [
      { key: 'employee_id', label: 'Employee ID', required: true, lockOnEdit: true },
      { key: 'employee_name', label: 'Employee Name', required: true },
      { key: 'department', label: 'Department' },
      { key: 'designation', label: 'Designation' },
      {
        key: 'employee_type',
        label: 'Employee Type',
        type: 'select',
        options: ['Permanent', 'Contract', 'Apprentice'],
      },
      { key: 'joining_date', label: 'Joining Date', type: 'date' },
      { key: 'employee_status', label: 'Status', type: 'select', options: ['Active', 'Inactive'] },
    ],
  },
]

const LIST_COLUMNS = [
  { key: 'employee_id', label: 'Employee ID' },
  { key: 'employee_name', label: 'Employee Name' },
  { key: 'department', label: 'Department' },
  { key: 'designation', label: 'Designation' },
  { key: 'employee_type', label: 'Employee Type' },
  { key: 'employee_status', label: 'Status', type: 'status' },
]

export default function EmployeeMaster() {
  return (
    <MasterFormScreen
      title="Employee Master"
      subtitle="Manage Employee Information  |  Shop Floor Workforce"
      pkField="employee_id"
      emptyForm={EMPTY_FORM}
      sections={SECTIONS}
      listColumns={LIST_COLUMNS}
      searchFields={['employee_id', 'employee_name']}
      api={{ list: listEmployees, create: createEmployee, update: updateEmployee, remove: deleteEmployee }}
      exportFilename="employee_master.csv"
    />
  )
}
