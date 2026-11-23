// 059_employee_grade_private.sql: structure checks (the file is run by hand
// in the Supabase SQL editor -- every statement must stand alone).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../../../backend/migrations/059_employee_grade_private.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n') // CRLF checkout
const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
const section = (name) => {
  const start = sql.search(new RegExp(`-{10,} ${name}`))
  const rest = sql.slice(start + 1)
  const next = rest.search(/\n-- -{10,} [A-Z]/)
  return next === -1 ? rest : rest.slice(0, next)
}
const strip = (s) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
const change = strip(section('CHANGE'))
const verification = strip(section('VERIFICATION'))
const T = 'public."employee private details"'

describe('059 migration file', () => {
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

  it('grade: nullable text, max 30 check, re-runnable', () => {
    expect(change).toContain('alter table public."employees master" add column if not exists grade text;')
    const drop = change.indexOf('drop constraint if exists employees_master_grade_len')
    const add = change.indexOf('add constraint employees_master_grade_len check (grade is null or char_length(grade) <= 30)')
    expect(drop).toBeGreaterThan(-1)
    expect(add).toBeGreaterThan(drop)
  })

  it('private table: columns, PK, FK ON DELETE RESTRICT, aadhaar exactly 4 digits', () => {
    expect(change).toContain(`create table if not exists ${T} (`)
    for (const col of ['employee_id   text primary key', 'phone_1       text', 'phone_2       text', 'address       text', 'aadhaar_last4 text', 'updated_at    timestamptz not null default now()', 'updated_by    uuid default auth.uid()']) {
      expect(change).toContain(col)
    }
    expect(change).toMatch(/foreign key \(employee_id\) references public\."employees master" \(employee_id\) on delete restrict;/)
    expect(change).not.toMatch(/on delete cascade/i)
    expect(change).toContain("check (aadhaar_last4 is null or aadhaar_last4 ~ '^[0-9]{4}$')")
  })

  it('stamp trigger is INVOKER, guarded by is_app_caller(), re-runnable', () => {
    expect(change).toMatch(/create or replace function public\.stamp_employee_private_details\(\) returns trigger\nlanguage plpgsql set search_path = public as \$\$/)
    expect(change).toContain('if is_app_caller() then')
    expect(change.indexOf('drop trigger if exists trg_employee_private_stamp')).toBeLessThan(change.indexOf('create trigger trg_employee_private_stamp'))
  })

  it('RLS on; exactly 4 policies: supervisor read / insert / update, admin delete; each dropped first', () => {
    expect(change).toContain(`alter table ${T} enable row level security;`)
    const policies = change.match(/create policy "[^"]+"/g)
    expect(policies).toEqual([
      'create policy "employee private details read"',
      'create policy "employee private details insert"',
      'create policy "employee private details update"',
      'create policy "employee private details delete"',
    ])
    expect(change).toContain(`create policy "employee private details read" on ${T} for select to authenticated using (public.is_app_supervisor());`)
    expect(change).toContain(`create policy "employee private details insert" on ${T} for insert to authenticated with check (public.is_app_supervisor());`)
    expect(change).toContain(`create policy "employee private details update" on ${T} for update to authenticated using (public.is_app_supervisor()) with check (public.is_app_supervisor());`)
    expect(change).toContain(`create policy "employee private details delete" on ${T} for delete to authenticated using (public.is_app_admin());`)
    for (const p of ['read', 'insert', 'update', 'delete']) {
      expect(change.indexOf(`drop policy if exists "employee private details ${p}"`)).toBeLessThan(change.indexOf(`create policy "employee private details ${p}"`))
    }
    expect(change).not.toMatch(/using \(true\)|with check \(true\)/)
  })

  it('grants: nothing for anon / public; authenticated select, insert, update, delete only', () => {
    expect(change).toContain(`revoke all on ${T} from public;`)
    expect(change).toContain(`revoke all on ${T} from anon;`)
    expect(change).toContain(`revoke truncate, references, trigger on ${T} from authenticated;`)
    expect(change).toContain(`grant select, insert, update, delete on ${T} to authenticated;`)
    expect(change).not.toMatch(/grant [^;]* to anon/i)
    expect(change).not.toMatch(/to anon/)
  })

  it('VERIFICATION lists the policies and checks operators have no read path (expect 0 rows)', () => {
    expect(verification).toMatch(/from pg_policies[\s\S]*tablename = 'employee private details'/)
    expect(verification).toMatch(/cmd in \('SELECT', 'ALL'\) and \(qual is null or \(qual not like '%is_app_supervisor\(\)%' and qual not like '%is_app_admin\(\)%'\)\)/)
    expect(verification).toMatch(/'anon' = any\(roles\)/)
    expect(verification).toMatch(/relrowsecurity/)
    expect(verification).toMatch(/prosecdef/)
  })

  it('PREVIEW shows the 058 employees master policies; ROLLBACK drops everything 059 added', () => {
    expect(strip(section('PREVIEW'))).toMatch(/from pg_policies\nwhere schemaname = 'public' and tablename = 'employees master'/)
    const rollback = section('ROLLBACK')
    for (const s of [
      'drop table if exists public."employee private details";',
      'drop function if exists public.stamp_employee_private_details();',
      'drop constraint if exists employees_master_grade_len;',
      'drop column if exists grade;',
    ]) expect(rollback).toContain(s)
  })
})
