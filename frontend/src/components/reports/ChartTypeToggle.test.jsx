import { Children, createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import { Bar, Cell, LabelList, Line } from 'recharts'
import ChartTypeToggle, { ChartTypeProvider, series, useChartType } from './ChartTypeToggle'

function TypeProbe() {
  return h('span', { 'data-type': useChartType() })
}

const pressed = (html, label) => new RegExp(`aria-pressed="(true|false)"[^>]*>(?:(?!</button>).)*${label}`).exec(html)?.[1]

describe('ChartTypeToggle', () => {
  it('defaults to Bar', () => {
    const html = renderToStaticMarkup(h(ChartTypeProvider, null, h(ChartTypeToggle), h(TypeProbe)))
    expect(html).toContain('data-type="bar"')
    expect(pressed(html, 'Bar')).toBe('true')
    expect(pressed(html, 'Line')).toBe('false')
  })

  it('Line selected: the toggle and useChartType report line', () => {
    const html = renderToStaticMarkup(h(ChartTypeProvider, { initial: 'line' }, h(ChartTypeToggle), h(TypeProbe)))
    expect(html).toContain('data-type="line"')
    expect(pressed(html, 'Line')).toBe('true')
  })

  it('renders nothing outside a provider; useChartType falls back to bar', () => {
    const html = renderToStaticMarkup(h('div', null, h(ChartTypeToggle), h(TypeProbe)))
    expect(html).not.toContain('Chart type')
    expect(html).toContain('data-type="bar"')
  })

  it('series() gives a real Bar for bar and a Line for line', () => {
    const bar = series('bar', { key: 'q', dataKey: 'qty', name: 'Qty', color: '#123456', stackId: 's' })
    expect(bar.type).toBe(Bar)
    expect(bar.props).toMatchObject({ dataKey: 'qty', name: 'Qty', fill: '#123456', stackId: 's' })
    const line = series('line', { key: 'q', dataKey: 'qty', name: 'Qty', color: '#123456', stackId: 's' })
    expect(line.type).toBe(Line)
    expect(line.props).toMatchObject({ dataKey: 'qty', stroke: '#123456' })
    expect(line.props.stackId).toBeUndefined()
  })

  it('a line drops per-point Cells but keeps LabelList', () => {
    const children = [h(Cell, { key: 'a', fill: 'red' }), h(LabelList, { key: 'l', dataKey: 'qty' })]
    const line = series('line', { dataKey: 'qty', children })
    const kept = Children.toArray(line.props.children)
    expect(kept).toHaveLength(1)
    expect(kept[0].type).toBe(LabelList)
    const bar = series('bar', { dataKey: 'qty', children })
    expect(Children.toArray(bar.props.children)).toHaveLength(2)
  })
})
