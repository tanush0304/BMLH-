import { SelectInput } from './FormSection'
import { sortedEmployeeOptions } from '../utils/employeeLabel'

/** Shared employee picker -- "Name (ID)" labels, sorted by name, falling back
 * to the bare ID when a name is missing. Always writes/reads the real
 * employee_id as its value; callers keep their own Field/required/label. */
export default function EmployeeSelect({ employees, value, onChange, disabled }) {
  return <SelectInput value={value} onChange={onChange} disabled={disabled} options={sortedEmployeeOptions(employees)} />
}
