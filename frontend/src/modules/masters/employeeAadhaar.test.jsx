// @vitest-environment jsdom
// Employee Master -- full 12-digit Aadhaar (061). Before 061: the last-4
// field; after: the 12-digit field (digits only, shown "1234 5678 9012",
// Verhoeff + first digit 2-9). Privacy: never in console, errors, list or exports.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { verhoeffCheckDigit, formatAadhaar } from '../../utils/aadhaar'

const withCheck = (eleven) => `${eleven}${verhoeffCheckDigit(eleven)}`
const SAVED = withCheck('23456789012') // synthetic
const TYPED = withCheck('98765432109') // synthetic
const BAD = `${TYPED.slice(0, 11)}${(Number(TYPED[11]) + 1) % 10}`

const m = vi.hoisted(() => ({
  full: true,
  last4Present: false,
  priv: null,
  getPriv: vi.fn(),
  savePriv: vi.fn(),
  csv: vi.fn(),
}))
vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('../../data/queries/employees', () => ({
  listEmployees: async () => [{ employee_id: 'EMP-1', employee_name: 'Ravi', grade: 'G2', employee_status: 'Active' }],
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  deleteEmployee: vi.fn(),
}))
vi.mock('../../data/queries/employeePrivate', () => ({
  employeeGradeSupported: async () => true,
  employeePrivateSupported: async () => true,
  employeePhotoSupported: async () => false,
  employeeAadhaarFullSupported: async () => m.full,
  employeeAadhaarLast4Present: async () => m.last4Present,
  getEmployeePrivate: (...a) => m.getPriv(...a),
  saveEmployeePrivate: (...a) => m.savePriv(...a),
}))
vi.mock('../../utils/exportUtils', () => ({ exportToCsv: (...a) => m.csv(...a), exportToPdf: vi.fn() }))
import EmployeeMaster from './EmployeeMaster'

let consoleSpies
beforeEach(() => {
  m.full = true
  m.last4Present = false
  m.priv = { employee_id: 'EMP-1', phone_1: null, phone_2: null, address: null, aadhaar_number: SAVED }
  m.getPriv.mockReset().mockImplementation(async () => m.priv)
  m.savePriv.mockReset().mockImplementation(async (p) => ({ ...m.priv, ...p }))
  m.csv.mockClear()
  consoleSpies = ['log', 'info', 'warn', 'error', 'debug'].map((k) => vi.spyOn(console, k).mockImplementation(() => {}))
})
afterEach(() => {
  for (const spy of consoleSpies) {
    const text = JSON.stringify(spy.mock.calls)
    for (const n of [SAVED, TYPED, BAD]) {
      expect(text).not.toContain(n)
      expect(text).not.toContain(formatAadhaar(n))
    }
    spy.mockRestore()
  }
  cleanup()
})

async function openEmployee(role = 'supervisor') {
  render(<EmployeeMaster role={role} />)
  fireEvent.click(await screen.findByText('Ravi'))
}
async function startEdit() {
  await openEmployee()
  await waitFor(() => expect(screen.getByLabelText('Aadhaar').value).toBe(formatAadhaar(SAVED)))
  fireEvent.click(screen.getByRole('button', { name: 'Edit personal details' }))
  return screen.getByLabelText('Aadhaar number')
}
const shownErrors = () => screen.queryAllByRole('alert').map((a) => a.textContent).join(' ')

describe('Employee Aadhaar -- before / after 061', () => {
  it('before 061: the last-4 field, loaded the old way', async () => {
    m.full = false
    m.priv = { employee_id: 'EMP-1', aadhaar_last4: '4321' }
    await openEmployee()
    await waitFor(() => expect(screen.getByLabelText('Aadhaar').value).toBe('XXXX XXXX 4321'))
    expect(screen.getByText('Aadhaar last 4 digits', { selector: 'span' })).toBeTruthy()
    expect(m.getPriv).toHaveBeenLastCalledWith('EMP-1', { withPhoto: false })
  })

  it('after 061: full number shown formatted; aadhaar_last4 never selected once dropped', async () => {
    await openEmployee()
    await waitFor(() => expect(screen.getByLabelText('Aadhaar').value).toBe(formatAadhaar(SAVED)))
    expect(screen.getByText('Aadhaar number', { selector: 'span' })).toBeTruthy()
    expect(m.getPriv).toHaveBeenLastCalledWith('EMP-1', { withPhoto: false, aadhaarMode: 'full', last4Present: false })
  })

  it('Part B skipped (last-4 column still there): still the 12-digit field', async () => {
    m.last4Present = true
    await openEmployee()
    await waitFor(() => expect(screen.getByLabelText('Aadhaar').value).toBe(formatAadhaar(SAVED)))
    expect(m.getPriv).toHaveBeenLastCalledWith('EMP-1', { withPhoto: false, aadhaarMode: 'full', last4Present: true })
    expect(screen.queryByText('Aadhaar last 4 digits', { selector: 'span' })).toBeNull()
  })
})

describe('Employee Aadhaar -- 12-digit field', () => {
  it('accepts digits only, max 12, formats as typed', async () => {
    const input = await startEdit()
    fireEvent.change(input, { target: { value: '9876a5432-1098765' } })
    expect(input.value).toBe('9876 5432 1098')
  })

  it('fewer than 12 digits refused; nothing saved; message without the number', async () => {
    const input = await startEdit()
    fireEvent.change(input, { target: { value: TYPED.slice(0, 11) } })
    fireEvent.click(screen.getByRole('button', { name: 'Save personal details' }))
    expect(await screen.findByText('Aadhaar must be exactly 12 digits.')).toBeTruthy()
    expect(m.savePriv).not.toHaveBeenCalled()
    expect(shownErrors()).not.toContain(TYPED.slice(0, 11))
  })

  it('wrong check digit / first digit 0-1 refused with "This is not a valid Aadhaar number."', async () => {
    const input = await startEdit()
    fireEvent.change(input, { target: { value: BAD } })
    fireEvent.click(screen.getByRole('button', { name: 'Save personal details' }))
    expect(await screen.findByText('This is not a valid Aadhaar number.')).toBeTruthy()
    fireEvent.change(input, { target: { value: withCheck('13456789012') } })
    fireEvent.click(screen.getByRole('button', { name: 'Save personal details' }))
    expect(await screen.findByText('This is not a valid Aadhaar number.')).toBeTruthy()
    expect(m.savePriv).not.toHaveBeenCalled()
    expect(shownErrors()).not.toMatch(/\d{4}/)
  })

  it('valid number saved as 12 plain digits (no aadhaar_last4 sent); shown formatted after', async () => {
    const input = await startEdit()
    fireEvent.change(input, { target: { value: formatAadhaar(TYPED) } })
    fireEvent.click(screen.getByRole('button', { name: 'Save personal details' }))
    await waitFor(() => expect(m.savePriv).toHaveBeenCalledTimes(1))
    const sent = m.savePriv.mock.calls[0][0]
    expect(sent.aadhaar_number).toBe(TYPED)
    expect(sent).not.toHaveProperty('aadhaar_last4')
    expect(await screen.findByText('Personal details saved for EMP-1.')).toBeTruthy()
    expect(screen.getByLabelText('Aadhaar').value).toBe(formatAadhaar(TYPED))
  })

  it('cleared field saves null', async () => {
    const input = await startEdit()
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save personal details' }))
    await waitFor(() => expect(m.savePriv).toHaveBeenCalledTimes(1))
    expect(m.savePriv.mock.calls[0][0].aadhaar_number).toBeNull()
  })

  it('DB refusal: fixed text only, typed number stays in the field', async () => {
    m.savePriv.mockImplementation(async () => { throw Object.assign(new Error(`Failing row contains (EMP-1, ${TYPED})`), { code: '23514' }) })
    const input = await startEdit()
    fireEvent.change(input, { target: { value: TYPED } })
    fireEvent.click(screen.getByRole('button', { name: 'Save personal details' }))
    expect(await screen.findByText('Check the personal details (Aadhaar must be 12 digits).')).toBeTruthy()
    expect(shownErrors()).not.toContain(TYPED)
    expect(input.value).toBe(formatAadhaar(TYPED))
  })

  it('never in the Employee Master list or exports', async () => {
    await openEmployee()
    await waitFor(() => expect(screen.getByLabelText('Aadhaar').value).toBe(formatAadhaar(SAVED)))
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers.some((h) => /aadhaar/i.test(h))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /print|export/i }))
    fireEvent.click(await screen.findByRole('button', { name: /excel/i }).catch(() => screen.getByText(/excel/i)))
    await waitFor(() => expect(m.csv).toHaveBeenCalled())
    const dumped = JSON.stringify(m.csv.mock.calls[0])
    expect(dumped).not.toMatch(/aadhaar/i)
    expect(dumped).not.toContain(SAVED)
  })

  it('operator: no card, no probe of the private table', async () => {
    await openEmployee('operator')
    expect(screen.queryByLabelText('Aadhaar')).toBeNull()
    expect(m.getPriv).not.toHaveBeenCalled()
  })
})
