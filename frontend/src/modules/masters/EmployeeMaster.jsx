import { useEffect, useState } from 'react'
import { ContactRound } from 'lucide-react'
import MasterFormScreen from '../../components/MasterFormScreen'
import { listEmployees, createEmployee, updateEmployee, deleteEmployee } from '../../data/queries/employees'
import { employeeGradeSupported, employeePrivateSupported } from '../../data/queries/employeePrivate'
import { canSeePrivate } from '../../utils/employeePrivate'
import EmployeePrivateSection from './EmployeePrivateSection'

const EMPTY_FORM = {
  employee_id: '',
  employee_name: '',
  department: '',
  designation: '',
  employee_type: '',
  joining_date: '',
  employee_status: '',
}

const GRADE_FIELD = { key: 'grade', label: 'Grade', maxLength: 30, nullIfBlank: true } // 059

function sectionsFor(gradeOn) {
  const fields = [
    { key: 'employee_id', label: 'Employee ID', required: true, lockOnEdit: true },
    { key: 'employee_name', label: 'Employee Name', required: true },
    { key: 'department', label: 'Department' },
    { key: 'designation', label: 'Designation' },
    ...(gradeOn ? [GRADE_FIELD] : []),
    {
      key: 'employee_type',
      label: 'Employee Type',
      type: 'select',
      options: ['Permanent', 'Contract', 'Apprentice'],
    },
    { key: 'joining_date', label: 'Joining Date', type: 'date' },
    { key: 'employee_status', label: 'Status', type: 'select', options: ['Active', 'Inactive'] },
  ]
  return [{ icon: ContactRound, title: '1. Employee Details', subtitle: 'Employee identity and role', width: 'full', fields }]
}

// List + exports: never the private fields (they are not in these rows at all).
function columnsFor(gradeOn) {
  return [
    { key: 'employee_id', label: 'Employee ID' },
    { key: 'employee_name', label: 'Employee Name' },
    { key: 'department', label: 'Department' },
    { key: 'designation', label: 'Designation' },
    ...(gradeOn ? [{ key: 'grade', label: 'Grade' }] : []),
    { key: 'employee_type', label: 'Employee Type' },
    { key: 'employee_status', label: 'Status', type: 'status' },
  ]
}

export default function EmployeeMaster({ role } = {}) {
  // 059 probes; until known (or before 059) the old screen: no Grade, no Personal details.
  const [gradeOn, setGradeOn] = useState(false)
  const [privateOn, setPrivateOn] = useState(false)
  const showPrivate = privateOn && canSeePrivate(role)

  useEffect(() => {
    let active = true
    employeeGradeSupported().then((ok) => active && setGradeOn(!!ok)).catch(() => {})
    if (canSeePrivate(role)) employeePrivateSupported().then((ok) => active && setPrivateOn(!!ok)).catch(() => {})
    return () => { active = false }
  }, [role])

  return (
    <MasterFormScreen
      title="Employee Master"
      subtitle="Manage Employee Information  |  Shop Floor Workforce"
      pkField="employee_id"
      recordType="employee"
      nameField="employee_name"
      emptyForm={gradeOn ? { ...EMPTY_FORM, grade: '' } : EMPTY_FORM}
      sections={sectionsFor(gradeOn)}
      listColumns={columnsFor(gradeOn)}
      searchFields={['employee_id', 'employee_name']}
      api={{ list: listEmployees, create: createEmployee, update: updateEmployee, remove: deleteEmployee }}
      exportFilename="employee_master.csv"
      renderAfterSections={showPrivate
        ? ({ form, mode, nextNumber }) => (
          <EmployeePrivateSection employeeId={mode === 'new' ? null : form.employee_id} number={nextNumber} />
        )
        : undefined}
    />
  )
}
