// Same "Name (ID)" display pattern as utils/machineLabel.js /
// utils/customerLabel.js. Display only -- the saved value is always
// employee_id, never the label. Falls back to the bare ID if the name is
// missing, and never renders "undefined".
export function employeeLabel(employee) {
  return employee?.employee_name ? `${employee.employee_name} (${employee.employee_id})` : employee?.employee_id ?? ''
}

function sortKey(employee) {
  return employee.employee_name || employee.employee_id || ''
}

/** Employees as {value, label} dropdown options, sorted by display name
 * (falling back to ID when a name is missing) rather than by ID. */
export function sortedEmployeeOptions(employees) {
  return [...employees]
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
    .map((employee) => ({ value: employee.employee_id, label: employeeLabel(employee) }))
}

/** For lists/history that only have the raw employee_id and need to show
 * "Name (ID)" -- falls back to the bare id if that id isn't in `employees` at
 * all (e.g. a stale/deleted employee), never "undefined". */
export function employeeLabelForId(employeeId, employees) {
  if (!employeeId) return ''
  const employee = employees.find((candidate) => candidate.employee_id === employeeId)
  return employee ? employeeLabel(employee) : employeeId
}
