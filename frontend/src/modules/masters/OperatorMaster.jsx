import { UserCog } from 'lucide-react'
import MasterFormScreen from '../../components/MasterFormScreen'
import { listOperators, createOperator, updateOperator, deleteOperator } from '../../data/queries/operators'

const EMPTY_FORM = {
  operator_emp_id: '',
  operator_name: '',
  department: '',
  designation: '',
  employee_type: '',
  joining_date: '',
  operator_status: '',
}

const SECTIONS = [
  {
    icon: UserCog,
    title: '1. Operator Details',
    fields: [
      { key: 'operator_emp_id', label: 'Employee ID', required: true, lockOnEdit: true },
      { key: 'operator_name', label: 'Operator Name', required: true },
      { key: 'department', label: 'Department' },
      { key: 'designation', label: 'Designation' },
      {
        key: 'employee_type',
        label: 'Employee Type',
        type: 'select',
        options: ['Permanent', 'Contract', 'Apprentice'],
      },
      { key: 'joining_date', label: 'Joining Date', type: 'date' },
      { key: 'operator_status', label: 'Status', type: 'select', options: ['Active', 'Inactive'] },
    ],
  },
]

const LIST_COLUMNS = [
  { key: 'operator_emp_id', label: 'Employee ID' },
  { key: 'operator_name', label: 'Operator Name' },
  { key: 'department', label: 'Department' },
  { key: 'designation', label: 'Designation' },
  { key: 'employee_type', label: 'Employee Type' },
  { key: 'operator_status', label: 'Status', type: 'status' },
]

export default function OperatorMaster() {
  return (
    <MasterFormScreen
      title="Operator Master"
      subtitle="Manage Operator Information  |  Shop Floor Workforce"
      pkField="operator_emp_id"
      emptyForm={EMPTY_FORM}
      sections={SECTIONS}
      listColumns={LIST_COLUMNS}
      searchFields={['operator_emp_id', 'operator_name']}
      api={{ list: listOperators, create: createOperator, update: updateOperator, remove: deleteOperator }}
      exportFilename="operator_master.csv"
    />
  )
}
