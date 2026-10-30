// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, within } from '@testing-library/react'
import MasterFormScreen from './MasterFormScreen'
import { MASTER_PAYMENT_TERMS } from '../utils/poTermsOptions'

afterEach(() => cleanup())

function renderScreen(records) {
  render(
    <MasterFormScreen
      title="Test Master"
      pkField="code"
      emptyForm={{ code: '', payment_terms: '' }}
      sections={[{ title: '1. Details', fields: [{ key: 'code', label: 'Code' }, { key: 'payment_terms', label: 'Payment Terms', type: 'addNew', options: MASTER_PAYMENT_TERMS }] }]}
      listColumns={[{ key: 'code', label: 'Code' }]}
      searchFields={['code']}
      api={{ list: vi.fn().mockResolvedValue(records), create: vi.fn(), update: vi.fn(), remove: vi.fn() }}
      exportFilename="test"
    />
  )
}

describe("MasterFormScreen 'addNew' field", () => {
  it('offers the built-ins, every value already saved in the column, then "+ Add new"', async () => {
    renderScreen([{ code: 'A', payment_terms: '75 Days' }, { code: 'B', payment_terms: '30 Days' }, { code: 'C', payment_terms: null }])
    const label = screen.getByText('Payment Terms').closest('label')
    await waitFor(() => expect(within(label).getByRole('option', { name: '75 Days' })).toBeTruthy())
    const options = within(label).getAllByRole('option').map((o) => o.textContent)
    for (const term of MASTER_PAYMENT_TERMS) expect(options).toContain(term)
    expect(options.filter((o) => o === '30 Days')).toHaveLength(1) // saved built-in not duplicated
    expect(options.indexOf('75 Days')).toBeGreaterThan(options.indexOf('90 Days')) // saved values after built-ins
    expect(options.some((o) => /Add new/i.test(o))).toBe(true)
  })
})
