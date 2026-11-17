// 056_jobwork_gauge_and_security.sql: structure checks (the file is run by hand
// in the Supabase SQL editor -- every statement must stand alone).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../../../backend/migrations/056_jobwork_gauge_and_security.sql', import.meta.url), 'utf8')
// statements only (comment lines dropped)
const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

describe('056 migration file', () => {
  it('has PREVIEW, CHANGE, VERIFICATION and ROLLBACK in that order', () => {
    const at = ['-- PREVIEW', '-- CHANGE', '-- VERIFICATION', '-- ROLLBACK'].map((h) => sql.search(new RegExp(`-{10,} ${h.slice(3)}`)))
    at.forEach((i) => expect(i).toBeGreaterThan(-1))
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it('no begin/commit, no temp tables, no security definer, no DO blocks', () => {
    expect(code).not.toMatch(/\b(begin|commit)\s*;/i)
    expect(code).not.toMatch(/temp(orary)?\s+table|on commit drop/i)
    expect(code).not.toMatch(/security\s+definer/i)
    expect(code).not.toMatch(/\bdo\s+\$\$/i)
  })

  it('Job Work = Gauge check, re-runnable (drop if exists first)', () => {
    const drop = code.indexOf('drop constraint if exists quality_master_jobwork_gauge_check')
    const add = code.indexOf('add constraint quality_master_jobwork_gauge_check')
    expect(drop).toBeGreaterThan(-1)
    expect(add).toBeGreaterThan(drop)
    expect(code).toMatch(/check \(job_work_code is null or check_type = 'Gauge'\)/)
  })

  it('app settings: admin insert / update policies dropped, insert + update revoked, read policy untouched', () => {
    expect(code).toContain('drop policy if exists "app settings admin insert"')
    expect(code).toContain('drop policy if exists "app settings admin update"')
    expect(code).toMatch(/revoke insert, update on table public\."app settings" from authenticated;/)
    expect(code).not.toMatch(/drop policy if exists "app settings read"/)
    expect(code).not.toMatch(/revoke[^;]*select[^;]*"app settings"/i)
    expect(code).not.toMatch(/create policy/i)
  })

  it('reopen guard: EXECUTE revoked from anon (and PUBLIC); PREVIEW shows who has it', () => {
    expect(code).toContain('revoke execute on function public.guard_stage_reopens_insert() from anon;')
    expect(code).toContain('revoke execute on function public.guard_stage_reopens_insert() from public;')
    expect(code).toMatch(/has_function_privilege\(r\.rolname, 'public\.guard_stage_reopens_insert\(\)'/)
  })

  it('PREVIEW lists non-Gauge Job Work rows, app settings policies and grants', () => {
    const preview = sql.slice(0, sql.search(/-{10,} CHANGE/))
    expect(preview).toMatch(/job_work_code is not null and check_type is distinct from 'Gauge'/)
    expect(preview).toContain("from pg_policies")
    expect(preview).toContain('role_table_grants')
  })
})
