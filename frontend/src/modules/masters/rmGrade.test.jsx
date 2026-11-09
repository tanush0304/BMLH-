// @vitest-environment jsdom
// RM Master Grade (041): hidden and never sent before the column exists;
// shown (add-new list of saved grades) + saved once it does. Dia = the
// existing diameter_mm, now next to the name. Code hint shown.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))
const q = vi.hoisted(() => ({
  listRawMaterials: vi.fn(),
  createRawMaterial: vi.fn(),
  updateRawMaterial: vi.fn(),
  deleteRawMaterial: vi.fn(),
  rmGradeSupported: vi.fn(),
  listSuppliers: vi.fn(),
  listProducts: vi.fn(),
  listRawMaterialStockMaster: vi.fn(),
  listSuppliersForRawMaterial: vi.fn(),
  createRmSupplierLink: vi.fn(),
  deleteRmSupplierLink: vi.fn(),
}))
vi.mock('../../data/queries/rawMaterials', () => q)
vi.mock('../../data/queries/suppliers', () => q)
vi.mock('../../data/queries/products', () => q)
vi.mock('../../data/queries/storeMasters', () => q)
vi.mock('../../data/queries/rmSuppliers', () => q)

import RawMaterialMaster from './RawMaterialMaster'

const RMS = [{ raw_material_code: 'SCM415H-D50', raw_material_name: 'Bar', grade: 'SCM415H', diameter_mm: '50', opening_stock: 0 }]

beforeEach(() => {
  q.listRawMaterials.mockReset().mockResolvedValue(RMS)
  q.listSuppliers.mockReset().mockResolvedValue([])
  q.listProducts.mockReset().mockResolvedValue([])
  q.listRawMaterialStockMaster.mockReset().mockResolvedValue([])
  q.listSuppliersForRawMaterial.mockReset().mockResolvedValue([])
  q.createRawMaterial.mockReset().mockImplementation(async (p) => p)
})
afterEach(() => cleanup())

const field = (label) => screen.getByText(label, { selector: 'span' }).closest('label')

async function fillAndSave() {
  await screen.findByText('SCM415H-D50')
  fireEvent.change(within(field('Raw Material Code')).getByRole('textbox'), { target: { value: 'EN8-D40' } })
  fireEvent.change(within(field('Raw Material Name')).getByRole('textbox'), { target: { value: 'EN8 Bar' } })
  fireEvent.change(within(field('Dia (mm)')).getByRole('textbox'), { target: { value: '40' } })
}

describe('RM Master Grade', () => {
  it('before 041: no Grade field / column, payload has no grade', async () => {
    q.rmGradeSupported.mockReset().mockResolvedValue(false)
    q.listRawMaterials.mockResolvedValue(RMS.map(({ grade, ...r }) => r)) // eslint-disable-line no-unused-vars
    render(<RawMaterialMaster />)
    await fillAndSave()
    expect(screen.queryByText('Grade', { selector: 'span' })).toBeNull()
    expect(screen.getByText('One code per size, e.g. SCM415H-D50')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }))
    await waitFor(() => expect(q.createRawMaterial).toHaveBeenCalled())
    const payload = q.createRawMaterial.mock.calls[0][0]
    expect(payload).not.toHaveProperty('grade')
    expect(payload.diameter_mm).toBe('40')
  })

  it('after 041: Grade offers saved grades + add-new and is saved', async () => {
    q.rmGradeSupported.mockReset().mockResolvedValue(true)
    render(<RawMaterialMaster />)
    await fillAndSave()
    const gradeSelect = await waitFor(() => within(field('Grade')).getByRole('combobox'))
    const options = within(gradeSelect).getAllByRole('option').map((o) => o.textContent)
    expect(options).toContain('SCM415H')
    expect(options.some((o) => /Add new/.test(o))).toBe(true)
    fireEvent.change(gradeSelect, { target: { value: 'SCM415H' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }))
    await waitFor(() => expect(q.createRawMaterial).toHaveBeenCalled())
    expect(q.createRawMaterial.mock.calls[0][0].grade).toBe('SCM415H')
    expect(screen.getAllByText('Grade').length).toBeGreaterThan(0)
  })
})
