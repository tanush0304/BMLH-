import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import MainMenu from './MainMenu'

const render = (role) => renderToStaticMarkup(createElement(MainMenu, { role, onNavigate: () => {}, onSignOut: () => {} }))

describe('Main Menu role gating', () => {
  it('locks Masters, Customer Orders, Jobwork and Reports and Dashboard for an operator', () => {
    const html = render('operator')
    expect(html).toContain('aria-label="Customer Orders. Supervisor or admin access required."')
    expect(html).toContain('aria-label="Jobwork. Supervisor or admin access required."')
    ;['Quality', 'Stores', 'Maintenance'].forEach((m) => expect(html).toContain(`aria-label="Open ${m}"`))
    expect(html).toContain('aria-label="Masters. Supervisor or admin access required."')
    expect(html).toContain('aria-label="Reports and Dashboard. Supervisor or admin access required."')
    expect(html).toContain('aria-label="Open Production"')
  })

  it('opens both for a supervisor', () => {
    const html = render('supervisor')
    expect(html).toContain('aria-label="Open Masters"')
    expect(html).toContain('aria-label="Open Reports and Dashboard"')
    expect(html).toContain('aria-label="Open Customer Orders"')
    expect(html).toContain('aria-label="Open Jobwork"')
  })
})
