import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import MainMenu from './MainMenu'

const render = (role) => renderToStaticMarkup(createElement(MainMenu, { role, onNavigate: () => {}, onSignOut: () => {} }))

describe('Main Menu role gating', () => {
  it('hides Masters, Customer Orders, Jobwork and Reports and Dashboard from an operator', () => {
    const html = render('operator')
    expect(html).not.toContain('Customer Orders')
    expect(html).not.toContain('Jobwork')
    ;['Quality', 'Stores', 'Maintenance'].forEach((m) => expect(html).toContain(`aria-label="Open ${m}"`))
    expect(html).not.toContain('Masters')
    expect(html).not.toContain('Reports and Dashboard')
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
