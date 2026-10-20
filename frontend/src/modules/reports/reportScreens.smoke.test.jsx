// @vitest-environment jsdom
// Render smoke test for every Reports & Dashboard chart screen: mounted with
// mocked empty and sample data, in Bar and Line mode. A crash in render
// (white page) unmounts the tree, so each case asserts the page title and the
// first KPI are on screen and that React reported no error.
import { cloneElement } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { todayISO } from '../../utils/dates'
import { addDays } from '../../utils/reportPeriods'

// Charts get a real size (jsdom has no layout), so series actually render.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, ResponsiveContainer: ({ children }) => cloneElement(children, { width: 800, height: 300 }) }
})
vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }))

const T = todayISO()
const D1 = addDays(T, -1)
const D2 = addDays(T, -2)

// ---------------------------------------------------------------- sample rows
const HOURS = [
  { log_id: 1, log_date: D1, shift_code: 'A', employee_id: 'E1', prd_no: 'PRD-1', stage_id: 11, stage_seq: 1, operation: 'Turning', machine_id: 'MC-1', machine_name: 'CNC 1', machine_category: 'CNC', hour_rows: 4, produced: 40, rejected: 2, rework: 1, idle_breakdown: 10, idle_no_material: 0, idle_no_operator: 0, idle_power_cut: 0, idle_tool_change: 5, idle_quality_issue: 0, idle_others: 0, idle_lunch: 30, planned_qty: 100, cycle_time_min: 5, standard_qty_per_hour: 12, shift_hours: 8 },
  { log_id: 2, log_date: T, shift_code: 'B', employee_id: 'E2', prd_no: 'PRD-2', stage_id: 21, stage_seq: 1, operation: 'Milling', machine_id: 'MC-2', machine_name: 'VMC 1', machine_category: 'VMC', hour_rows: 2, produced: 15, rejected: 0, rework: 0, idle_breakdown: 0, idle_no_material: 0, idle_no_operator: 0, idle_power_cut: 0, idle_tool_change: 0, idle_quality_issue: 0, idle_others: 0, idle_lunch: 0, planned_qty: 50, cycle_time_min: 8, standard_qty_per_hour: 7, shift_hours: 8 },
]
const SAMPLE = {
  listProductionHours: HOURS,
  listLoggedPrds: ['PRD-1', 'PRD-2'],
  listProductionSetup: [{ log_id: 1, log_date: D1, shift_code: 'A', machine_id: 'MC-1', machine_name: 'CNC 1', machine_category: 'CNC', setting_time_min: 20, prd_no: 'PRD-1' }],
  listMachines: [{ machine_id: 'MC-1', machine_name: 'CNC 1', category: 'CNC' }, { machine_id: 'MC-2', machine_name: 'VMC 1', category: 'VMC' }],
  listShifts: [{ shift_code: 'A', shift_name: 'Shift A' }, { shift_code: 'B', shift_name: 'Shift B' }],
  listEmployees: [{ employee_id: 'E1', employee_name: 'Ravi' }, { employee_id: 'E2', employee_name: 'Asha' }],
  listOrdersByPrd: [{ prd_no: 'PRD-1', part_serial_number: 'P1', part_name: 'Shaft', prd_qty: 100, customer_id: 'C1', order_line_id: 1 }, { prd_no: 'PRD-2', part_serial_number: 'P2', part_name: 'Gear', prd_qty: 50, customer_id: 'C2', order_line_id: 2 }],
  listProductionOrders: [{ prd_no: 'PRD-1', order_line_id: 1, batch_no: 1, prd_qty: 100 }],
  listAllStages: [{ id: 11, prd_no: 'PRD-1', seq: 1, operation: 'Turning', type: 'Internal', status: 'Completed' }, { id: 12, prd_no: 'PRD-1', seq: 2, operation: 'Heat Treat', type: 'Outsourced', status: 'Pending' }],
  listWipTransactionsUpTo: [
    { id: 1, prd_no: 'PRD-1', nature_of_operation_stage_id: 11, transaction_type: 'Receipt', qty: 30, transaction_date: D2 },
    { id: 2, prd_no: 'PRD-1', nature_of_operation_stage_id: 11, target_stage_id: 12, transaction_type: 'Issue', qty: 10, transaction_date: D1 },
  ],
  listFgTransactionsUpTo: [
    { id: 1, prd_no: 'PRD-1', transaction_type: 'Production Receipt', qty: 40, transaction_date: D2 },
    { id: 2, prd_no: 'PRD-1', transaction_type: 'Dispatch', qty: 25, transaction_date: D1 },
  ],
  listFgMasterRows: [{ prd_no: 'PRD-1', order_line_id: 1, customer_name: 'Acme', part_serial_number: 'P1', part_name: 'Shaft', prd_qty: 100, order_quantity: 200, unit_of_measurement: 'Nos' }],
  listPartDrawingRefs: [{ part_serial_number: 'P1', part_drawing_reference_number: 'DRG-1' }],
  listRmTransactionsUpTo: [
    { id: 1, raw_material_code: 'RM-1', transaction_type: 'Receipt', qty: 500, transaction_date: D2, supplier_id: 'S1' },
    { id: 2, raw_material_code: 'RM-1', transaction_type: 'Issue', qty: 100, transaction_date: D1 },
  ],
  listRmStockMasterRows: [{ row_key: 'RM-1|P1', raw_material_code: 'RM-1', raw_material_name: 'EN8 Bar', rm_type: 'Bar', unit_of_measurement: 'Kg', supplier_names: 'Tata Steel', opening_stock: 50, part_serial_number: 'P1', part_name: 'Shaft', consumption_per_unit: 2 }],
  listSuppliers: [{ supplier_id: 'S1', supplier_name: 'Tata Steel' }],
  listOrdersByPoDate: [{ order_line_id: 1, customer_id: 'C1', po_number: 'PO-1', po_date: D2, part_serial_number: 'P1', order_qty: 200, prd_no: null }],
  listCustomers: [{ customer_id: 'C1', customer_name: 'Acme' }, { customer_id: 'C2', customer_name: 'Brahma' }],
  listProducts: [{ part_serial_number: 'P1', part_name: 'Shaft' }],
  listJobOrderStatusRows: [
    { dc_no: 'DC-1', prd_no: 'PRD-1', stage_id: 12, job_work_code: 'JW-1', vendor_id: 'V1', qty: 30, qty_received: 20, dispatch_date: D2, expected_receipt_date: D1, status: 'Partially Received', is_open: true, is_overdue: true, balance_qty: 10, short_qty: 0, receipt_nos: 'JR-1' },
    { dc_no: 'DC-2', prd_no: 'PRD-1', stage_id: 12, job_work_code: 'JW-1', vendor_id: 'V1', qty: 10, qty_received: 8, dispatch_date: D2, expected_receipt_date: T, status: 'Closed Short', is_open: false, is_overdue: false, balance_qty: 0, short_qty: 2, receipt_nos: 'JR-2' },
  ],
  listVendors: [{ vendor_id: 'V1', vendor_name: 'Heat Co' }],
  listJobWorkTypes: [{ job_work_code: 'JW-1', type_of_job_work: 'Heat Treatment', lead_time_days: 3 }],
  listQualityInspections: [
    { quality_log_id: 1, prd_no: 'PRD-1', stage_id: 11, stage_seq: 1, operation: 'Turning', machine_id: 'MC-1', machine_name: 'CNC 1', machine_category: 'CNC', log_date: D1, shift_code: 'A', employee_id: 'E1', inspection_result: 'Accepted' },
    { quality_log_id: 2, prd_no: 'PRD-1', stage_id: 11, stage_seq: 1, operation: 'Turning', machine_id: 'MC-1', machine_name: 'CNC 1', machine_category: 'CNC', log_date: T, shift_code: 'B', employee_id: 'E2', inspection_result: 'No readings' },
  ],
  listReadingsForLogs: [{ reading_id: 1, quality_log_id: 1, quality_parameter: 'Dia', observed_value: 10.02, standard: 10, upper_tolerance: 0.05, lower_tolerance: 0.05, result: 'Accepted' }],
  listQualityParameters: [{ id: 1, part_serial_number: 'P1', machine_id: 'MC-1', quality_parameter: 'Dia', standard: 10 }],
  listComplaintsForReport: [
    { id: 1, complaint_no: 'CMP-1', complaint_date: D1, customer_id: 'C1', part_serial_number: 'P1', defect_problem: 'Burr', severity: 'Major', status: 'Open' },
    { id: 2, complaint_no: 'CMP-2', complaint_date: T, customer_id: 'C2', part_serial_number: 'P2', defect_problem: ' burr', severity: null, status: 'Closed' },
  ],
}

// Every query returns the current data set (empty or sample).
let data = 'sample'
const fn = (name) => vi.fn(async () => (data === 'sample' ? SAMPLE[name] ?? [] : []))
vi.mock('../../data/queries/reports', () => Object.fromEntries(
  ['listProductionHours', 'listLoggedPrds', 'listProductionSetup', 'listWipTransactionsUpTo', 'listFgTransactionsUpTo', 'listFgMasterRows', 'listPartDrawingRefs', 'listRmTransactionsUpTo', 'listRmStockMasterRows', 'listOrdersByPoDate', 'listJobOrderStatusRows', 'listQualityInspections', 'listReadingsForLogs', 'listComplaintsForReport'].map((n) => [n, fn(n)])
))
vi.mock('../../data/queries/machines', () => ({ listMachines: fn('listMachines') }))
vi.mock('../../data/queries/shifts', () => ({ listShifts: fn('listShifts') }))
vi.mock('../../data/queries/employees', () => ({ listEmployees: fn('listEmployees') }))
vi.mock('../../data/queries/customerOrders', () => ({ listOrdersByPrd: fn('listOrdersByPrd'), listProductionOrders: fn('listProductionOrders') }))
vi.mock('../../data/queries/routeCards', () => ({ listAllStages: fn('listAllStages') }))
vi.mock('../../data/queries/suppliers', () => ({ listSuppliers: fn('listSuppliers') }))
vi.mock('../../data/queries/customers', () => ({ listCustomers: fn('listCustomers') }))
vi.mock('../../data/queries/products', () => ({ listProducts: fn('listProducts') }))
vi.mock('../../data/queries/vendors', () => ({ listVendors: fn('listVendors') }))
vi.mock('../../data/queries/jobWorkTypes', () => ({ listJobWorkTypes: fn('listJobWorkTypes') }))
vi.mock('../../data/queries/qualityParameters', () => ({ listQualityParameters: fn('listQualityParameters') }))

const { ChartTypeProvider } = await import('../../components/reports/ChartTypeToggle')
const SCREENS = [
  ['ProductionStatus', (await import('./ProductionStatusScreen')).default, 'Production Status Report', 'CNC 1'],
  ['Downtime', (await import('./DowntimeScreen')).default, 'Downtime', 'Hours'],
  ['WipStatus', (await import('./WipStatusScreen')).default, 'WIP', 'PRD-1'],
  ['CustomerOrderStatus', (await import('./CustomerOrderStatusScreen')).default, 'Customer Order', 'PO-1'],
  ['JobOrderStatus', (await import('./JobOrderStatusScreen')).default, 'Job Order Status Report', 'Partially Received (Closed)'],
  ['FgInventory', (await import('./FgInventoryScreen')).default, 'Finished Goods Inventory Report', 'DRG-1'],
  ['QualityStatus', (await import('./QualityStatusScreen')).default, 'Quality Status Report', 'Dia'],
  ['RawMaterialStatus', (await import('./RawMaterialStatusScreen')).default, 'Raw Material Status Report', 'EN8 Bar'],
  ['DailyMachine', (await import('./DailyMachineScreen')).default, 'Daily Machine Wise Dashboard', 'VMC'],
  ['ComplaintStatus', (await import('./ComplaintStatusScreen')).default, 'Customer Complaint Report', 'CMP-1'],
]

let errors
beforeEach(() => {
  errors = []
  vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args.map(String).join(' ')))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// Recharts warns about chart sizing in jsdom; anything else logged as an
// error (React render errors, key warnings that hide crashes) fails the case.
const realErrors = () => errors.filter((e) => !/width\(0\) and height\(0\)|The width\(-?\d+\) and height/.test(e))

describe.each(['empty', 'sample'])('report screens with %s data', (set) => {
  describe.each(['bar', 'line'])('%s mode', (mode) => {
    it.each(SCREENS)('%s renders without crashing', async (_name, Screen, title, sampleText) => {
      data = set
      let view
      await act(async () => {
        view = render(
          <ChartTypeProvider initial={mode}>
            <Screen onOpenTraceability={() => {}} initialPrdNo="" />
          </ChartTypeProvider>
        )
      })
      // let every mocked query resolve and the screen re-render
      for (let i = 0; i < 4; i++) await act(async () => {})
      expect(view.container.innerHTML).not.toBe('')
      expect(view.container.textContent).toContain(title)
      if (set === 'sample') expect(view.container.textContent).toContain(sampleText) // data really loaded
      expect(realErrors()).toEqual([])
    })
  })
})
