// 057_quality_samples.sql: structure checks (run by hand in the Supabase SQL
// editor -- every statement must stand alone and be re-runnable).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../../../backend/migrations/057_quality_samples.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n') // CRLF checkout
const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
const section = (name) => {
  const start = sql.search(new RegExp(`-{10,} ${name}`))
  const rest = sql.slice(start + 20)
  const next = rest.search(/-- -{10,} [A-Z]/)
  return next < 0 ? rest : rest.slice(0, next)
}

describe('057 migration file', () => {
  it('PREVIEW, CHANGE, VERIFICATION, ROLLBACK in order', () => {
    const at = ['PREVIEW', 'CHANGE', 'VERIFICATION', 'ROLLBACK'].map((h) => sql.search(new RegExp(`-{10,} ${h}`)))
    at.forEach((i) => expect(i).toBeGreaterThan(-1))
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it('no begin/commit, temp tables, DO blocks or security definer; no new functions', () => {
    expect(code).not.toMatch(/\b(begin|commit)\s*;/i)
    expect(code).not.toMatch(/temp(orary)?\s+table|on commit drop/i)
    expect(code).not.toMatch(/\bdo\s+\$\$/i)
    expect(code).not.toMatch(/security\s+definer/i)
    expect(code).not.toMatch(/create (or replace )?function/i)
  })

  it('sample_no smallint not null default 1, check 1..10, unique (log, parameter, sample), old unique dropped -- all re-runnable', () => {
    expect(code).toContain('add column if not exists sample_no smallint not null default 1')
    expect(code).toMatch(/drop constraint if exists quality_log_readings_sample_no_check;[\s\S]*add constraint quality_log_readings_sample_no_check\s+check \(sample_no between 1 and 10\)/)
    expect(code).toMatch(/drop constraint if exists quality_log_readings_log_param_sample_key;[\s\S]*add constraint quality_log_readings_log_param_sample_key\s+unique \(quality_log_id, quality_parameter_id, sample_no\)/)
    // live name has spaces -> must be quoted (an unquoted underscore name silently dropped nothing)
    expect(code).toContain('drop constraint if exists "quality log readings_quality_log_id_quality_parameter_id_key";')
    expect(code).not.toMatch(/[^"]quality_log_readings_quality_log_id_quality_parameter_id_key/)
  })

  it('both audit triggers re-created identically with only sample_no added to the locked columns', () => {
    const change = section('CHANGE')
    expect(change).toContain(`audit_record_edit(
    'observed_value', 'id', 'quality_log_id', 'quality_parameter_id', 'created_at', 'sample_no')`)
    expect(change).toContain(`audit_record_edit(
    'gauge_result', 'id', 'quality_log_id', 'quality_parameter_id', 'created_at', 'sample_no')`)
    expect(change).toContain('before update on public."quality log readings"')
    expect(change).not.toMatch(/trg_quality_reading_check_type/) // 048 guard untouched
  })

  it('PREVIEW and VERIFICATION print pg_get_triggerdef for the 3 triggers', () => {
    for (const name of ['PREVIEW', 'VERIFICATION']) {
      const s = section(name)
      expect(s).toContain('pg_get_triggerdef')
      for (const t of ['trg_quality_log_readings_edit_audit', 'trg_quality_log_readings_gauge_audit', 'trg_quality_reading_check_type']) expect(s).toContain(t)
    }
  })

  it('view: sample_no appended last, no reloptions (no "with" clause)', () => {
    const change = section('CHANGE')
    const view = change.slice(change.indexOf('create or replace view public."quality log results"'))
    expect(view).toMatch(/qm\.gauge_standard,\s*(--[^\n]*\n\s*)?qlr\.sample_no\s+FROM/)
    expect(view.split('\n')[0]).not.toMatch(/with \(/)
  })

  it('CHANGE leaves both quality views SELECT-only for authenticated', () => {
    const change = section('CHANGE')
    for (const v of ['quality log results', 'report quality inspections']) {
      expect(change).toContain(`revoke insert, update, delete, truncate, references, trigger on public."${v}" from authenticated;`)
    }
    expect(change.indexOf('revoke insert, update')).toBeGreaterThan(change.indexOf('create or replace view'))
  })

  it('ROLLBACK drops and recreates "report quality inspections" from 029 with security_invoker and grants', () => {
    const rb = section('ROLLBACK')
    expect(rb.indexOf('drop view if exists public."report quality inspections"')).toBeLessThan(rb.indexOf('drop view if exists public."quality log results"'))
    expect(rb).toContain('create view public."report quality inspections"')
    expect(rb).toContain('with (security_invoker = true) as')
    expect(rb).toContain("else 'Rejected' end as inspection_result")
    expect(rb).toContain('grant select on public."report quality inspections" to authenticated;')
    expect(rb).toContain('drop column if exists sample_no')
  })
})
