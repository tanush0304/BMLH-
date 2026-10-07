import { describe, it, expect } from 'vitest'
import { stagesEligibleForMachine, machinesEligibleForSeqs } from './machineEligibility'

// Shaped like HPV2's real cycle time master rows: operation text uses
// HPV2's own names ("Rough Turning ONE", "Reaming TWO", ...) which never
// match "machine operations"' generic names -- but eligibility here never
// looks at operation text at all, only part_serial_number + seq + machine_id.
const HPV2_CYCLE_TIME_ROWS = [
  { part_serial_number: 'HPV2', seq: 2, machine_id: 'MC-001', operation: 'Rough Turning ONE' },
  { part_serial_number: 'HPV2', seq: 2, machine_id: 'MC-002', operation: 'Rough Turning ONE' },
  { part_serial_number: 'HPV2', seq: 2, machine_id: 'MC-003', operation: 'Rough Turning ONE' },
  { part_serial_number: 'HPV2', seq: 3, machine_id: 'MC-001', operation: 'Finish Turning ONE' },
  { part_serial_number: 'HPV2', seq: 5, machine_id: 'MC-001', operation: 'Reaming TWO' },
  { part_serial_number: 'HPV2', seq: 6, machine_id: 'MC-001', operation: 'Slotting TWO' },
  { part_serial_number: 'HPV2', seq: 11, machine_id: 'MC-001', operation: 'Face Drilling TWO' },
]

const HPV2_STAGES = [
  { id: 'st-2', prd_no: 'PRD-100', seq: 2, operation: 'Rough Turning ONE', type: 'Internal' },
  { id: 'st-3', prd_no: 'PRD-100', seq: 3, operation: 'Finish Turning ONE', type: 'Internal' },
  { id: 'st-5', prd_no: 'PRD-100', seq: 5, operation: 'Reaming TWO', type: 'Internal' },
  { id: 'st-6', prd_no: 'PRD-100', seq: 6, operation: 'Slotting TWO', type: 'Internal' },
  { id: 'st-11', prd_no: 'PRD-100', seq: 11, operation: 'Face Drilling TWO', type: 'Internal' },
]

describe('machinesEligibleForSeqs', () => {
  it('a stage with several eligible machines', () => {
    const rows = machinesEligibleForSeqs({ cycleTimeRows: HPV2_CYCLE_TIME_ROWS, partSerialNumber: 'HPV2', seqs: [2] })
    expect(rows.map((r) => r.machine_id).sort()).toEqual(['MC-001', 'MC-002', 'MC-003'])
  })

  it('an unknown part serial number returns nothing', () => {
    const rows = machinesEligibleForSeqs({ cycleTimeRows: HPV2_CYCLE_TIME_ROWS, partSerialNumber: 'NOPE', seqs: [2] })
    expect(rows).toEqual([])
  })

  it('no seqs requested returns nothing, never an undefined filter', () => {
    expect(machinesEligibleForSeqs({ cycleTimeRows: HPV2_CYCLE_TIME_ROWS, partSerialNumber: 'HPV2', seqs: [] })).toEqual([])
    expect(machinesEligibleForSeqs({ cycleTimeRows: HPV2_CYCLE_TIME_ROWS, partSerialNumber: undefined, seqs: [2] })).toEqual([])
  })
})

describe('stagesEligibleForMachine', () => {
  it('two stages sharing a machine (MC-001 on seq 2, 3, 5, 6 and 11)', () => {
    const stages = stagesEligibleForMachine({
      stages: HPV2_STAGES,
      cycleTimeRows: HPV2_CYCLE_TIME_ROWS,
      partSerialNumber: 'HPV2',
      machineId: 'MC-001',
    })
    expect(stages.map((s) => s.seq).sort((a, b) => a - b)).toEqual([2, 3, 5, 6, 11])
  })

  it('a machine with no rows for the product returns no eligible stages', () => {
    const stages = stagesEligibleForMachine({
      stages: HPV2_STAGES,
      cycleTimeRows: HPV2_CYCLE_TIME_ROWS,
      partSerialNumber: 'HPV2',
      machineId: 'MC-999',
    })
    expect(stages).toEqual([])
  })

  it('an unknown part serial number returns no eligible stages even for a real machine', () => {
    const stages = stagesEligibleForMachine({
      stages: HPV2_STAGES,
      cycleTimeRows: HPV2_CYCLE_TIME_ROWS,
      partSerialNumber: 'NOPE',
      machineId: 'MC-001',
    })
    expect(stages).toEqual([])
  })

  it('missing machineId never sends an undefined filter, just returns nothing', () => {
    const stages = stagesEligibleForMachine({
      stages: HPV2_STAGES,
      cycleTimeRows: HPV2_CYCLE_TIME_ROWS,
      partSerialNumber: 'HPV2',
      machineId: '',
    })
    expect(stages).toEqual([])
  })
})
