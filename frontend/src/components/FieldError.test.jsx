// @vitest-environment jsdom
// Field highlight: a validation that names a field shows in the toast, marks
// that field data-invalid and focuses it; editing it (or clearing the error)
// removes the highlight.
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
    <div style={{ overflowY: 'auto' }}>
      <MasterFormScreen
        title="Customer Master"
        pkField="customer_id"
        emptyForm={{ customer_id: '', customer_name: '', mobile_number: '' }}
        sections={[
          {
            title: 'Details',
            fields: [
              { key: 'customer_id', label: 'Customer ID', required: true },
              { key: 'customer_name', label: 'Customer Name', required: true },
              { key: 'mobile_number', label: 'Mobile Number', mobile: true },
            ],
          },
        ]}
        listColumns={[{ key: 'customer_id', label: 'Customer ID' }]}
        searchFields={['customer_id']}
        api={api}
      />
    </div>
  )
  return api
}

const fieldOf = (label) => screen.getAllByText(label).map((el) => el.closest('label[data-field]')).find(Boolean)
const inputOf = (label) => fieldOf(label).querySelector('input')
const save = () => fireEvent.click(screen.getByRole('button', { name: /^Save/ }))

describe('field highlight', () => {
  it('blank required field: toast at top, field highlighted and focused; typing clears it', async () => {
    const api = renderScreen()
    await screen.findByText('CUST-001')
    fireEvent.change(inputOf('Customer ID'), { target: { value: 'CUST-050' } })
    save()
    const toast = await screen.findByRole('alert')
    expect(toast.textContent).toContain('Customer Name is required.')
    expect(screen.getByTestId('toast').parentElement).toBe(document.body)
    expect(fieldOf('Customer Name').hasAttribute('data-invalid')).toBe(true)
    expect(fieldOf('Customer ID').hasAttribute('data-invalid')).toBe(false)
    await waitFor(() => expect(document.activeElement).toBe(inputOf('Customer Name')))
    fireEvent.change(inputOf('Customer Name'), { target: { value: 'New Co' } })
    expect(fieldOf('Customer Name').hasAttribute('data-invalid')).toBe(false)
    expect(api.create).not.toHaveBeenCalled()
  })

  it('duplicate code highlights the ID field', async () => {
    renderScreen()
    await screen.findByText('CUST-001')
    fireEvent.change(inputOf('Customer ID'), { target: { value: ' cust-001 ' } })
    fireEvent.change(inputOf('Customer Name'), { target: { value: 'Dup' } })
    save()
    expect((await screen.findByRole('alert')).textContent).toContain('already exists')
    expect(fieldOf('Customer ID').hasAttribute('data-invalid')).toBe(true)
    await waitFor(() => expect(document.activeElement).toBe(inputOf('Customer ID')))
  })

  it('bad mobile highlights the mobile field; dismissing the toast clears the highlight', async () => {
    renderScreen()
    await screen.findByText('CUST-001')
    fireEvent.change(inputOf('Customer ID'), { target: { value: 'CUST-051' } })
    fireEvent.change(inputOf('Customer Name'), { target: { value: 'New Co' } })
    fireEvent.change(inputOf('Mobile Number'), { target: { value: 'abc' } })
    save()
    await screen.findByRole('alert')
    expect(fieldOf('Mobile Number').hasAttribute('data-invalid')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(fieldOf('Mobile Number').hasAttribute('data-invalid')).toBe(false))
  })
})
