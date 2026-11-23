// @vitest-environment jsdom
// Employee Master (059): Grade (probe-gated, trimmed, max 30, blank -> null),
// "Personal details" card (supervisor/admin, probe-gated, own upsert, masked
// Aadhaar, fixed error texts), privacy (no values in console / screen errors /
// exports).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const SECRET = { phone: '9876543210', phone2: '08023456789', address: '12 Secret Lane', aadhaar: '4321' }
const m = vi.hoisted(() => ({
  gradeOn: true,
  privateOn: true,
  rows: [],
  priv: null,
  create: vi.fn(async (p) => p),
  update: vi.fn(async (_id, p) => p),
  savePriv: vi.fn(),
  getPriv: vi.fn(),
  privateProbe: vi.fn(),
  csv: vi.fn(),
}))
vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('../../data/queries/employees', () => ({
  listEmployees: async () => m.rows,
  createEmployee: m.create,
  updateEmployee: m.update,
  deleteEmployee: vi.fn(),
}))
vi.mock('../../data/queries/employeePrivate', () => ({
  employeeGradeSupported: async () => m.gradeOn,
  employeePrivateSupported: (...a) => m.privateProbe(...a),
  getEmployeePrivate: (...a) => m.getPriv(...a),
  saveEmployeePrivate: (...a) => m.savePriv(...a),
}))
vi.mock('../../utils/exportUtils', () => ({ exportToCsv: (...a) => m.csv(...a), exportToPdf: vi.fn() }))
import EmployeeMaster from './EmployeeMaster'

const input = (label) => screen.getByText(label, { selector: 'span' }).closest('label').querySelector('input, select')
const type = (el, value) => fireEvent.change(el, { target: { value } })
const ROW = { employee_id: 'EMP-1', employee_name: 'Ravi', department: 'Prod', designation: 'Operator', grade: 'G2', employee_type: 'Permanent', joining_date: null, employee_status: 'Active' }

let consoleSpies
beforeEach(() => {
  m.gradeOn = true
  m.privateOn = true
  m.rows = [ROW]
  m.priv = { employee_id: 'EMP-1', phone_1: SECRET.phone, phone_2: SECRET.phone2, address: SECRET.address, aadhaar_last4: SECRET.aadhaar }
  m.create.mockClear()
  m.update.mockClear()
  m.csv.mockClear()
  m.privateProbe.mockReset().mockImplementation(async () => m.privateOn)
  m.getPriv.mockReset().mockImplementation(async () => m.priv)
  m.savePriv.mockReset().mockImplementation(async (p) => p)
  consoleSpies = ['log', 'info', 'warn', 'error', 'debug'].map((k) => vi.spyOn(console, k).mockImplementation(() => {}))
})
afterEach(() => {
  // PRIVACY: nothing private ever reaches the console
  for (const spy of consoleSpies) {
    const text = JSON.stringify(spy.mock.calls)
    for (const v of Object.values(SECRET)) expect(text).not.toContain(v)
    spy.mockRestore()
  }
  cleanup()
})

async function openEmployee(role = 'supervisor') {
  render(<EmployeeMaster role={role} />)
  fireEvent.click(await screen.findByText('Ravi'))
}

describe('Employee Master -- Grade (059)', () => {
  it('before 059: no Grade field / column and grade never sent', async () => {
    m.gradeOn = false
    m.rows = [{ ...ROW, grade: undefined }]
    render(<EmployeeMaster role="supervisor" />)
    await screen.findByText('Ravi')
    expect(screen.queryByText('Grade', { selector: 'span' })).toBeNull()
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).not.toContain('Grade')
    type(input('Employee ID'), 'EMP-2')
    type(input('Employee Name'), 'Asha')
    fireEvent.click(screen.getByRole('button', { name: /^save/i }))
    await waitFor(() => expect(m.create).toHaveBeenCalled())
    expect(m.create.mock.calls[0][0]).not.toHaveProperty('grade')
  })

  it('after 059: Grade field + column; saved trimmed; blank -> null; over 30 refused', async () => {
    render(<EmployeeMaster role="supervisor" />)
    await screen.findByText('Ravi')
    await waitFor(() => expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toContain('Grade'))
    expect(screen.getByText('G2')).toBeTruthy()
    type(input('Employee ID'), 'EMP-2')
    type(input('Employee Name'), 'Asha')
    type(input('Grade'), 'x'.repeat(31))
    fireEvent.click(screen.getByRole('button', { name: /^save/i }))
    expect(await screen.findByText("Grade can't be longer than 30 characters.")).toBeTruthy()
    expect(m.create).not.toHaveBeenCalled()
    type(input('Grade'), '  Grade A  ')
    fireEvent.click(screen.getByRole('button', { name: /^save/i }))
    await waitFor(() => expect(m.create).toHaveBeenCalledTimes(1))
    expect(m.create.mock.calls[0][0].grade).toBe('Grade A')
  })

  it('blank grade is saved as null', async () => {
    render(<EmployeeMaster role="supervisor" />)
    await screen.findByText('Ravi')
    await waitFor(() => input('Grade'))
    type(input('Employee ID'), 'EMP-3')
    type(input('Employee Name'), 'Kiran')
    type(input('Grade'), '   ')
    fireEvent.click(screen.getByRole('button', { name: /^save/i }))
    await waitFor(() => expect(m.create).toHaveBeenCalledTimes(1))
    expect(m.create.mock.calls[0][0].grade).toBeNull()
  })

  it('exports: Grade yes, private fields never', async () => {
    await openEmployee()
    await screen.findByLabelText('Phone 1')
    fireEvent.click(screen.getByRole('button', { name: /print|export/i }))
    const excel = await screen.findByRole('button', { name: /excel/i }).catch(() => screen.getByText(/excel/i))
    fireEvent.click(excel)
    await waitFor(() => expect(m.csv).toHaveBeenCalled())
    const [columns, rows] = m.csv.mock.calls[0]
    expect(columns.map((c) => c.label)).toContain('Grade')
    const dumped = JSON.stringify([columns, rows])
    for (const k of ['phone_1', 'phone_2', 'address', 'aadhaar']) expect(dumped).not.toContain(k)
    for (const v of Object.values(SECRET)) expect(dumped).not.toContain(v)
  })
})

describe('Employee Master -- Personal details (059)', () => {
  it('operator: no card and the private table is never probed or read', async () => {
    await openEmployee('operator')
    await waitFor(() => expect(screen.getByText('Ravi')).toBeTruthy())
    expect(screen.queryByText(/Personal details/)).toBeNull()
    expect(m.privateProbe).not.toHaveBeenCalled()
    expect(m.getPriv).not.toHaveBeenCalled()
  })

  it('before 059: no card for a supervisor', async () => {
    m.privateOn = false
    await openEmployee()
    await waitFor(() => expect(m.privateProbe).toHaveBeenCalled())
    expect(screen.queryByText(/Personal details/)).toBeNull()
  })

  it('new employee: "Save the employee first"', async () => {
    render(<EmployeeMaster role="admin" />)
    expect(await screen.findByTestId('private-save-first')).toBeTruthy()
    expect(m.getPriv).not.toHaveBeenCalled()
  })

  it('open employee: values shown, Aadhaar always masked XXXX XXXX 1234', async () => {
    await openEmployee()
    await waitFor(() => expect(screen.getByLabelText('Phone 1').value).toBe(SECRET.phone))
    expect(screen.getByLabelText('Aadhaar').value).toBe(`XXXX XXXX ${SECRET.aadhaar}`)
    expect(screen.getByLabelText('Phone 1').disabled).toBe(true)
  })

  it('edit: Aadhaar input takes digits only (max 4); save = one upsert with cleaned values', async () => {
    m.priv = null
    await openEmployee()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit personal details' }))
    expect(screen.getByText('XXXX XXXX')).toBeTruthy()
    type(screen.getByLabelText('Aadhaar last 4'), '1a2b34567')
    expect(screen.getByLabelText('Aadhaar last 4').value).toBe('1234')
    type(screen.getByLabelText('Phone 1'), '+91 98765-43210')
    type(screen.getByLabelText('Phone 2'), '080-2345 6789')
    type(screen.getByLabelText('Address'), '  1 Main Rd ')
    fireEvent.click(screen.getByRole('button', { name: 'Save personal details' }))
    await waitFor(() => expect(m.savePriv).toHaveBeenCalledTimes(1))
    expect(m.savePriv.mock.calls[0][0]).toEqual({ employee_id: 'EMP-1', phone_1: '9876543210', phone_2: '08023456789', address: '1 Main Rd', aadhaar_last4: '1234' })
    expect(await screen.findByText('Personal details saved for EMP-1.')).toBeTruthy()
    expect(screen.getByLabelText('Aadhaar').value).toBe('XXXX XXXX 1234')
    expect(m.update).not.toHaveBeenCalled() // never through the Employee Master save
  })

  it('invalid phone: refused before any DB call, message without the value', async () => {
    m.priv = null
    await openEmployee()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit personal details' }))
    type(screen.getByLabelText('Phone 2'), '55555')
    fireEvent.click(screen.getByRole('button', { name: 'Save personal details' }))
    const msg = await screen.findByText(/^Phone 2: Enter a valid 10-digit mobile/)
    expect(msg.textContent).not.toContain('55555')
    expect(m.savePriv).not.toHaveBeenCalled()
  })

  it('DB refusal: fixed text only (no row values), typed values stay', async () => {
    m.savePriv.mockImplementation(async () => { throw Object.assign(new Error('x'), { code: '23514' }) })
    await openEmployee()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit personal details' }))
    type(screen.getByLabelText('Address'), SECRET.address + ' 2')
    fireEvent.click(screen.getByRole('button', { name: 'Save personal details' }))
    expect(await screen.findByText('Check the personal details (Aadhaar last 4 must be 4 digits).')).toBeTruthy()
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent).join(' ')
    for (const v of Object.values(SECRET)) expect(alerts).not.toContain(v)
    expect(screen.getByLabelText('Address').value).toBe(SECRET.address + ' 2')
  })

  it('load failure: fixed text', async () => {
    m.getPriv.mockImplementation(async () => { throw Object.assign(new Error('x'), { code: 'XX000' }) })
    await openEmployee()
    expect(await screen.findByText('Could not load personal details.')).toBeTruthy()
  })
})
