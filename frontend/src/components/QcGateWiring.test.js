// Quality gate after jobwork (055): every insert path the DB gate guards asks
// the frontend gate FIRST, with the right stage, and renders its popup.
// (Behaviour of the gate itself: utils/jobworkQc.test.js, QcGateDialog.test.jsx,
// and the full screen run in modules/production/jobworkQcGate.screen.test.jsx.)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

/** Body of `async function <name>(` up to the next top-level function. */
function fnBody(source, name) {
  const start = source.indexOf(`async function ${name}(`)
  expect(start).toBeGreaterThan(-1)
  const next = source.indexOf('\n  async function ', start + 10)
  const next2 = source.indexOf('\n  function ', start + 10)
  const end = Math.min(...[next, next2, source.length].filter((i) => i > -1))
  return source.slice(start, end)
}

const PATHS = [
  {
    file: 'modules/production/ProductionDataEntryScreen.jsx',
    fn: 'handleStart',
    check: 'qcGate.check({ prdNo, targetStageId: resolvedStage.id })',
    insert: 'createProductionLog(',
  },
  {
    file: 'modules/production/ManualOperationsScreen.jsx',
    fn: 'handleStart',
    check: 'qcGate.check({ prdNo, targetStageId: resolvedStage.id })',
    insert: 'createProductionLog(',
  },
  {
    file: 'modules/jobOrder/JobOrderDispatchScreen.jsx',
    fn: 'handleSave',
    check: 'qcGate.check({ prdNo, targetStageId: selectedStage.id })',
    insert: 'createDispatch(',
  },
  {
    file: 'modules/stores/WipIssueScreen.jsx',
    fn: 'handleSave',
    check: 'targetStageId: stageValidation.targetStage.id,\n      sourceStageId: stageValidation.sourceStage.id,',
    insert: 'createWipIssue(',
  },
]

describe('incoming QC gate is wired into every gated insert path', () => {
  for (const p of PATHS) {
    it(`${p.file}: checks before ${p.insert.slice(0, -1)}, stops when blocked, shows the popup`, () => {
      const s = src(p.file).replace(/\r\n/g, '\n')
      expect(s).toContain("import { useQcGate } from '../../components/QcGateDialog'")
      expect(s).toContain('const qcGate = useQcGate({ role })')
      expect(s).toContain('{qcGate.dialog}')
      const body = fnBody(s, p.fn)
      const at = body.indexOf(p.check)
      expect(at).toBeGreaterThan(-1)
      expect(body.indexOf(p.insert)).toBeGreaterThan(at) // asked BEFORE the insert
      // blocked -> returns without inserting
      expect(body.slice(at, body.indexOf(p.insert))).toMatch(/return\n/)
    })
  }
})
