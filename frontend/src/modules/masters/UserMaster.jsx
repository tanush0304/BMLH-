import { UserCog } from 'lucide-react'
import MasterFormScreen from '../../components/MasterFormScreen'
import { listUsers, createUser, updateUser, deleteUser } from '../../data/queries/users'

const EMPTY_FORM = {
  user_emp_id: '',
  user_name: '',
  department: '',
  designation: '',
  employee_type: '',
  joining_date: '',
  user_status: '',
}

const SECTIONS = [
  {
    icon: UserCog,
    title: '1. User Details',
    subtitle: 'Employee identity and role',
    width: 'full',
    fields: [
      { key: 'user_emp_id', label: 'Employee ID', required: true, lockOnEdit: true },
      { key: 'user_name', label: 'User Name', required: true },
      { key: 'department', label: 'Department' },
      { key: 'designation', label: 'Designation' },
      {
        key: 'employee_type',
        label: 'Employee Type',
        type: 'select',
        options: ['Permanent', 'Contract', 'Apprentice'],
      },
      { key: 'joining_date', label: 'Joining Date', type: 'date' },
      { key: 'user_status', label: 'Status', type: 'select', options: ['Active', 'Inactive'] },
    ],
  },
]

const LIST_COLUMNS = [
  { key: 'user_emp_id', label: 'Employee ID' },
  { key: 'user_name', label: 'User Name' },
  { key: 'department', label: 'Department' },
  { key: 'designation', label: 'Designation' },
  { key: 'employee_type', label: 'Employee Type' },
  { key: 'user_status', label: 'Status', type: 'status' },
]

export default function UserMaster() {
  return (
    <MasterFormScreen
      title="User Master"
      subtitle="Manage User Information  |  Shop Floor Workforce"
      pkField="user_emp_id"
      emptyForm={EMPTY_FORM}
      sections={SECTIONS}
      listColumns={LIST_COLUMNS}
      searchFields={['user_emp_id', 'user_name']}
      api={{ list: listUsers, create: createUser, update: updateUser, remove: deleteUser }}
      exportFilename="user_master.csv"
    />
  )
}
