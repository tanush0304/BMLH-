// 061_employee_aadhaar_full.sql: structure checks (the file is run by hand
// in the Supabase SQL editor -- every statement must stand alone).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../../../backend/migrations/061_employee_aadhaar_full.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n') // CRLF checkout
const strip = (s) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
const code = strip(sql)
const section = (name) => {
  const start = sql.search(new RegExp(`-{10,} ${name}`))
  const rest = sql.slice(start + 1)
  const next = rest.search(/\n-- -{10,} [A-Z]/)
  return next === -1 ? rest : rest.slice(0, next)
}
const changeRaw = section('CHANGE')
const change = strip(changeRaw)
const T = 'public."employee private details"'

describe('061 migration file', () => {
  it('has PREVIEW, CHANGE, VERIFICATION and ROLLBACK in that order', () => {
    const at = ['PREVIEW', 'CHANGE', 'VERIFICATION', 'ROLLBACK'].map((h) => sql.search(new RegExp(`-{10,} ${h}`)))
    at.forEach((i) => expect(i).toBeGreaterThan(-1))
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it('no begin/commit, no temp tables, no security definer, no DO blocks', () => {
    expect(code).not.toMatch(/\b(begin|commit)\s*;/i)
    expect(code).not.toMatch(/temp(orary)?\s+table|on commit drop/i)
    expect(code).not.toMatch(/security\s+definer/i)
    expect(code).not.toMatch(/\bdo\s+\$\$/i)
  })

  it('PREVIEW P1 counts rows with aadhaar_last4 (decides Part B)', () => {
    expect(strip(section('PREVIEW'))).toMatch(/select count\(\*\) as rows_with_aadhaar_last4\nfrom public\."employee private details"\nwhere aadhaar_last4 is not null;/)
  })

  it('Part A: aadhaar_number + exactly-12-digits check, re-runnable', () => {
    expect(change).toContain(`alter table ${T} add column if not exists aadhaar_number text;`)
    const drop = change.indexOf('drop constraint if exists employee_private_details_aadhaar_number_check')
    const add = change.indexOf('add constraint employee_private_details_aadhaar_number_check')
    expect(drop).toBeGreaterThan(-1)
    expect(add).toBeGreaterThan(drop)
    expect(change).toContain("check (aadhaar_number is null or aadhaar_number ~ '^[0-9]{12}$')")
  })

  it('Part B: after Part A, clearly gated on P1 = 0, drops last4 check then column', () => {
    const partA = changeRaw.indexOf('-- ---- Part A (always) ----')
    const partB = changeRaw.indexOf('-- ---- Part B: RUN ONLY IF PREVIEW P1 = 0 -- otherwise STOP and report the count ----')
    expect(partA).toBeGreaterThan(-1)
    expect(partB).toBeGreaterThan(partA)
    const b = changeRaw.slice(partB)
    const dropCheck = b.indexOf('drop constraint if exists employee_private_details_aadhaar_last4_check;')
    const dropCol = b.indexOf('drop column if exists aadhaar_last4;')
    expect(dropCheck).toBeGreaterThan(-1)
    expect(dropCol).toBeGreaterThan(dropCheck)
    expect(changeRaw.slice(0, partB)).not.toMatch(/drop column/)
  })

  it('no policy / grant changes (059 RLS covers the column)', () => {
    expect(change).not.toMatch(/\b(create|drop|alter) policy\b/i)
    expect(change).not.toMatch(/\b(grant|revoke)\b/i)
    expect(change).not.toMatch(/\banon\b/)
  })

  it('VERIFICATION: new column + check, last4 state, RLS + policies, operators cannot read (0 rows)', () => {
    const v = strip(section('VERIFICATION'))
    expect(v).toMatch(/column_name = 'aadhaar_number'/)
    expect(v).toMatch(/employee_private_details_aadhaar_number_check/)
    expect(v).toMatch(/column_name = 'aadhaar_last4'/)
    expect(v).toMatch(/relrowsecurity/)
    expect(v).toMatch(/cmd in \('SELECT', 'ALL'\) and \(qual is null or \(qual not like '%is_app_supervisor\(\)%' and qual not like '%is_app_admin\(\)%'\)\)/)
    expect(v).toMatch(/'anon' = any\(roles\)/)
  })

  it('ROLLBACK drops aadhaar_number; puts back an empty last-4 column + check only if Part B ran', () => {
    const rb = section('ROLLBACK')
    expect(rb).toContain('drop column if exists aadhaar_number;')
    expect(rb).toMatch(/Only if Part B ran/)
    expect(rb).toContain('add column if not exists aadhaar_last4 text;')
    expect(rb).toContain("check (aadhaar_last4 is null or aadhaar_last4 ~ '^[0-9]{4}$');")
  })
})
