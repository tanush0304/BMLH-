// @vitest-environment jsdom
// Employee photo (060): Storage mocked at the client (the real query helpers
// run), DB row helpers + browser resize mocked. Hidden before 060 / for
// operators; preview -> upload (id + timestamp path) -> photo_path upsert ->
// old file deleted; Remove; DB failure cleans the new file; 1-hour signed
// URL; never in the list / exports; no URL / path in console or errors.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'

const SIGNED = 'https://proj.supabase.co/storage/v1/object/sign/employee-photos/EMP-1/1700000000000.jpg?token=SECRET'
const OLD = 'EMP-1/1700000000000.jpg'
const s = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  sign: vi.fn(),
  bucket: [],
}))
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    storage: {
      from: (bucket) => {
        s.bucket.push(bucket)
        return { upload: s.upload, remove: s.remove, createSignedUrl: s.sign }
      },
    },
  },
}))
const m = vi.hoisted(() => ({
  photoOn: true,
  priv: null,
  getPriv: vi.fn(),
  savePriv: vi.fn(),
  csv: vi.fn(),
  resize: vi.fn(),
}))
vi.mock('../../data/queries/employeePrivate', async (importOriginal) => ({
  ...(await importOriginal()),
  employeeGradeSupported: async () => true,
  employeePrivateSupported: async () => true,
  employeePhotoSupported: async () => m.photoOn,
  getEmployeePrivate: (...a) => m.getPriv(...a),
  saveEmployeePrivate: (...a) => m.savePriv(...a),
}))
vi.mock('../../data/queries/employees', () => ({
  listEmployees: async () => [{ employee_id: 'EMP-1', employee_name: 'Ravi', grade: 'G2', employee_status: 'Active' }],
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  deleteEmployee: vi.fn(),
}))
vi.mock('../../utils/imageResize', async (importOriginal) => ({ ...(await importOriginal()), resizeToJpeg: (...a) => m.resize(...a) }))
vi.mock('../../utils/exportUtils', () => ({ exportToCsv: (...a) => m.csv(...a), exportToPdf: vi.fn() }))
import EmployeeMaster from './EmployeeMaster'

const jpeg = new Blob(['x'.repeat(1000)], { type: 'image/jpeg' })
let consoleSpies
beforeEach(() => {
  m.photoOn = true
  m.priv = { employee_id: 'EMP-1', phone_1: null, phone_2: null, address: null, aadhaar_last4: null, photo_path: OLD }
  m.getPriv.mockReset().mockImplementation(async () => m.priv)
  m.savePriv.mockReset().mockImplementation(async (p) => ({ ...m.priv, ...p }))
  m.csv.mockClear()
  m.resize.mockReset().mockResolvedValue(jpeg)
  s.upload.mockReset().mockResolvedValue({ data: {}, error: null })
  s.remove.mockReset().mockResolvedValue({ data: [], error: null })
  s.sign.mockReset().mockResolvedValue({ data: { signedUrl: SIGNED }, error: null })
  s.bucket = []
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview-1')
  globalThis.URL.revokeObjectURL = vi.fn()
  consoleSpies = ['log', 'info', 'warn', 'error', 'debug'].map((k) => vi.spyOn(console, k).mockImplementation(() => {}))
})
afterEach(() => {
  for (const spy of consoleSpies) {
    const text = JSON.stringify(spy.mock.calls)
    expect(text).not.toMatch(/supabase\.co|token=|employee-photos\/|EMP-1\/\d/)
    spy.mockRestore()
  }
  cleanup()
})

async function openEmployee(role = 'supervisor') {
  render(<EmployeeMaster role={role} />)
  fireEvent.click(await screen.findByText('Ravi'))
}
const pick = (file) => fireEvent.change(screen.getByLabelText('Choose photo'), { target: { files: [file] } })
const file = (type = 'image/png', size = 5000) => new File(['x'.repeat(size)], 'Ravi Kumar aadhaar 1234.png', { type })
const errorsShown = () => screen.queryAllByRole('alert').map((a) => a.textContent).join(' ')

describe('Employee photo (060)', () => {
  it('before 060: no photo block; private row loaded without photo_path', async () => {
    m.photoOn = false
    await openEmployee()
    await waitFor(() => expect(m.getPriv).toHaveBeenCalled())
    expect(m.getPriv).toHaveBeenLastCalledWith('EMP-1', { withPhoto: false })
    expect(screen.queryByTestId('employee-photo')).toBeNull()
  })

  it('operator: no card, no photo, no Storage call', async () => {
    await openEmployee('operator')
    expect(screen.queryByTestId('employee-photo')).toBeNull()
    expect(s.sign).not.toHaveBeenCalled()
    expect(m.getPriv).not.toHaveBeenCalled()
  })

  it('thumbnail via a 1-hour signed URL from the private bucket', async () => {
    await openEmployee()
    const img = await screen.findByAltText('Employee photo')
    expect(img.getAttribute('src')).toBe(SIGNED)
    expect(s.sign).toHaveBeenCalledWith(OLD, 3600)
    expect(s.bucket).toContain('employee-photos')
    expect(m.getPriv).toHaveBeenLastCalledWith('EMP-1', { withPhoto: true })
  })

  it('replace: resize 400 / 0.85 -> preview -> upload to "<id>/<timestamp>.jpg" -> upsert -> old file deleted', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1763900000123)
    await openEmployee()
    await screen.findByAltText('Employee photo')
    pick(file())
    const preview = await screen.findByAltText('New photo preview')
    expect(preview.getAttribute('src')).toBe('blob:preview-1')
    expect(m.resize).toHaveBeenCalledWith(expect.any(File), 400, 0.85)
    expect(s.upload).not.toHaveBeenCalled() // nothing uploaded before Save
    fireEvent.click(screen.getByRole('button', { name: 'Save photo' }))
    await screen.findByText('Photo saved.')
    expect(s.upload).toHaveBeenCalledWith('EMP-1/1763900000123.jpg', jpeg, { contentType: 'image/jpeg', upsert: false })
    expect(m.savePriv).toHaveBeenCalledWith({ employee_id: 'EMP-1', photo_path: 'EMP-1/1763900000123.jpg' })
    expect(s.remove).toHaveBeenCalledWith([OLD])
    // order: upload -> DB -> delete old
    expect(s.upload.mock.invocationCallOrder[0]).toBeLessThan(m.savePriv.mock.invocationCallOrder[0])
    expect(m.savePriv.mock.invocationCallOrder[0]).toBeLessThan(s.remove.mock.invocationCallOrder[0])
    // the file name never carries the picked file's name (name / Aadhaar)
    expect(JSON.stringify(s.upload.mock.calls)).not.toMatch(/Ravi|1234\.png|aadhaar/i)
    Date.now.mockRestore()
  })

  it('first photo: Upload photo; no old file to delete', async () => {
    m.priv = { ...m.priv, photo_path: null }
    await openEmployee()
    fireEvent.click(await screen.findByRole('button', { name: /Upload photo/ }))
    pick(file('image/jpeg'))
    fireEvent.click(await screen.findByRole('button', { name: 'Save photo' }))
    await screen.findByText('Photo saved.')
    expect(s.upload).toHaveBeenCalledTimes(1)
    expect(s.remove).not.toHaveBeenCalled()
  })

  it('DB refuses photo_path: the new file is deleted again, old kept, fixed text', async () => {
    m.savePriv.mockImplementation(async () => { throw Object.assign(new Error('x'), { code: '23514' }) })
    await openEmployee()
    await screen.findByAltText('Employee photo')
    pick(file())
    fireEvent.click(await screen.findByRole('button', { name: 'Save photo' }))
    expect(await screen.findByText('Could not upload the photo.')).toBeTruthy()
    const uploaded = s.upload.mock.calls[0][0]
    expect(s.remove).toHaveBeenCalledWith([uploaded])
    expect(s.remove).not.toHaveBeenCalledWith([OLD])
  })

  it('upload refused by Storage (too large / RLS): fixed texts, no path or URL', async () => {
    s.upload.mockResolvedValueOnce({ error: { statusCode: '413', message: `Payload too large for ${SIGNED}` } })
    await openEmployee()
    await screen.findByAltText('Employee photo')
    pick(file())
    fireEvent.click(await screen.findByRole('button', { name: 'Save photo' }))
    expect(await screen.findByText('The photo must be under 2 MB.')).toBeTruthy()
    expect(m.savePriv).not.toHaveBeenCalled()
    s.upload.mockResolvedValueOnce({ error: { statusCode: '403', message: `new row violates row-level security policy ${OLD}` } })
    fireEvent.click(screen.getByRole('button', { name: 'Save photo' }))
    expect(await screen.findByText('You do not have permission to change employee photos.')).toBeTruthy()
    expect(errorsShown()).not.toMatch(/supabase\.co|token=|EMP-1\/\d/)
  })

  it('picked file: GIF refused; unreadable image refused; nothing uploaded', async () => {
    await openEmployee()
    await screen.findByAltText('Employee photo')
    pick(file('image/gif'))
    expect(await screen.findByText('Only JPEG or PNG photos.')).toBeTruthy()
    m.resize.mockRejectedValueOnce(Object.assign(new Error('bad'), { code: 'resize' }))
    pick(file())
    expect(await screen.findByText(/Could not read this image/)).toBeTruthy()
    expect(s.upload).not.toHaveBeenCalled()
  })

  it('Remove photo: confirm -> photo_path null -> file deleted', async () => {
    await openEmployee()
    fireEvent.click(await screen.findByRole('button', { name: /Remove photo/ }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog.textContent).not.toContain(OLD)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await screen.findByText('Photo removed.')
    expect(m.savePriv).toHaveBeenCalledWith({ employee_id: 'EMP-1', photo_path: null })
    expect(s.remove).toHaveBeenCalledWith([OLD])
    expect(screen.queryByAltText('Employee photo')).toBeNull()
  })

  it('signed URL failure: fixed text only', async () => {
    s.sign.mockResolvedValueOnce({ data: null, error: { statusCode: '400', message: `Object not found ${OLD}` } })
    await openEmployee()
    expect(await screen.findByText('Could not load the photo.')).toBeTruthy()
    expect(errorsShown()).not.toContain(OLD)
  })

  it('never in the Employee Master list or exports', async () => {
    await openEmployee()
    await screen.findByAltText('Employee photo')
    const list = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(list.some((h) => /photo/i.test(h))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /print|export/i }))
    fireEvent.click(await screen.findByRole('button', { name: /excel/i }).catch(() => screen.getByText(/excel/i)))
    await waitFor(() => expect(m.csv).toHaveBeenCalled())
    expect(JSON.stringify(m.csv.mock.calls[0])).not.toMatch(/photo|EMP-1\/\d|supabase\.co/)
    // the card thumbnail is the only photo on the page (header logos aside)
    expect([...document.querySelectorAll('img')].filter((i) => i.getAttribute('src') === SIGNED)).toHaveLength(1)
    expect(screen.getByAltText('Employee photo').closest('[data-testid="employee-photo"]')).toBeTruthy()
  })
})
