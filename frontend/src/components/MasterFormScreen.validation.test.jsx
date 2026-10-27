// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import MasterFormScreen from './MasterFormScreen'

afterEach(() => cleanup())

function renderScreen() {
  const api = {
    list: vi.fn().mockResolvedValue([{ customer_id: 'CUST-001', customer_name: 'Acme' }]),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn(),
    remove: vi.fn(),
  }
  render(
    <MasterFormScreen
      title="Customer Master"
      pkField="customer_id"
      emptyForm={{ customer_id: '', customer_name: '', mobile_number: '', lead: '' }}
      sections={[
        {
          title: 'Details',
          fields: [
            { key: 'customer_id', label: 'Customer ID', required: true },
            { key: 'customer_name', label: 'Customer Name', required: true },
            { key: 'mobile_number', label: 'Mobile Number', mobile: true },
            { key: 'lead', label: 'Lead Time (Days)', type: 'number', number: { integer: true, min: 0, minExclusive: true, max: 365 } },
          ],
        },
      ]}
      listColumns={[{ key: 'customer_id', label: 'Customer ID' }]}
      searchFields={['customer_id']}
      api={api}
    />
  )
  return api
}

const input = (label) => screen.getAllByText(label).map((el) => el.closest('label')?.querySelector('input')).find(Boolean)
const type = (label, value) => fireEvent.change(input(label), { target: { value } })
const save = () => fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))
const loaded = async (api) => {
  await waitFor(() => expect(api.list).toHaveBeenCalled())
  await screen.findAllByText('CUST-001')
}

describe('MasterFormScreen validation', () => {
  it.each([
    ['spaces only', '   ', 'Customer ID is required.'],
    ['padded duplicate', ' CUST-001 ', 'CUST-001 already exists.'],
    ['case duplicate', 'cust-001', 'CUST-001 already exists.'],
    ['31-character code', 'C'.repeat(31), "Customer ID can't be longer than 30 characters."],
  ])('refuses %s before any DB call', async (_, code, message) => {
    const api = renderScreen()
    await loaded(api)
    type('Customer ID', code)
    type('Customer Name', 'ZZ')
    save()
    expect(await screen.findByText(message)).toBeTruthy()
    expect(api.create).not.toHaveBeenCalled()
  })

  it('refuses a bad mobile and a bad number', async () => {
    const api = renderScreen()
    await loaded(api)
    type('Customer ID', 'CUST-009')
    type('Customer Name', 'New')
    type('Mobile Number', 'abc')
    save()
    expect(await screen.findByText(/10-digit mobile or a landline with STD code/)).toBeTruthy()
    type('Mobile Number', '9876543210')
    type('Lead Time (Days)', '0')
    save()
    expect(await screen.findByText('Lead Time (Days) must be greater than 0.')).toBeTruthy()
    expect(api.create).not.toHaveBeenCalled()
  })

  it('saves trimmed text and the cleaned 10-digit mobile', async () => {
    const api = renderScreen()
    await loaded(api)
    type('Customer ID', '  CUST-009 ')
    type('Customer Name', ' New Co ')
    type('Mobile Number', '+91 98765-43210')
    save()
    await waitFor(() => expect(api.create).toHaveBeenCalled())
    expect(api.create.mock.calls[0][0]).toMatchObject({ customer_id: 'CUST-009', customer_name: 'New Co', mobile_number: '9876543210' })
  })

  it('saves a landline with STD code as cleaned digits with the leading 0', async () => {
    const api = renderScreen()
    await loaded(api)
    type('Customer ID', 'CUST-010')
    type('Customer Name', 'Landline Co')
    type('Mobile Number', '(0821) 234567')
    save()
    await waitFor(() => expect(api.create).toHaveBeenCalled())
    expect(api.create.mock.calls[0][0]).toMatchObject({ mobile_number: '0821234567' })
  })
})
