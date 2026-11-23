// 058_master_write_supervisor.sql: structure checks (the file is run by hand
// in the Supabase SQL editor -- every statement must stand alone).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../../../backend/migrations/058_master_write_supervisor.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n') // CRLF checkout
// statements only (comment lines dropped)
const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
const section = (name) => {
  const start = sql.search(new RegExp(`-{10,} ${name}`))
  const rest = sql.slice(start + 1)
  const next = rest.search(/\n-- -{10,} [A-Z]/)
  return next === -1 ? rest : rest.slice(0, next)
}
const change = section('CHANGE').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
const rollback = section('ROLLBACK')

const MASTERS = [
  'customers master', 'customer delivery addresses', 'suppliers master', 'vendors master',
  'vendor job work types', 'job work master', 'employees master', 'shifts master',
  'machines master', 'machine operations', 'operations master', 'products master',
  'product raw materials', 'raw materials master', 'rm suppliers', 'cycle time master',
  'production batch master', 'quality master', 'maintenance master', 'maintenance schedule',
]
const TRANSACTIONS = [
  'production logs', 'production log hours', 'production route card stages', 'production orders',
  'job order dispatch', 'job order receipt', 'raw material transactions', 'wip transactions',
  'finished goods transactions', 'quality logs', 'quality log readings', 'maintenance logs',
  'maintenance log items', 'maintenance plan', 'customer orders', 'customer po headers',
]
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

describe('058 migration file', () => {
  it('has PREVIEW, CHANGE, VERIFICATION and ROLLBACK in that order', () => {
    const at = ['PREVIEW', 'CHANGE', 'VERIFICATION', 'ROLLBACK'].map((h) => sql.search(new RegExp(`-{10,} ${h}`)))
    at.forEach((i) => expect(i).toBeGreaterThan(-1))
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it('no begin/commit, no temp tables, no security definer, no DO blocks, nothing for anon', () => {
    expect(code).not.toMatch(/\b(begin|commit)\s*;/i)
    expect(code).not.toMatch(/temp(orary)?\s+table|on commit drop/i)
    expect(code).not.toMatch(/security\s+definer/i)
    expect(code).not.toMatch(/\bdo\s+\$\$/i)
    expect(change).not.toMatch(/\banon\b/)
    expect(change).not.toMatch(/\bgrant\b|\brevoke\b/i)
  })

  it.each(MASTERS)('%s: RLS on, full-access dropped, read (all) + write (supervisor) created, re-runnable', (t) => {
    const q = `public\\."${esc(t)}"`
    expect(change).toMatch(new RegExp(`alter table ${q} enable row level security;`))
    expect(change).toMatch(new RegExp(`drop policy if exists "authenticated full access" on ${q};`))
    const dropRead = change.search(new RegExp(`drop policy if exists "${esc(t)} read" on ${q};`))
    const dropWrite = change.search(new RegExp(`drop policy if exists "${esc(t)} write" on ${q};`))
    const read = change.search(new RegExp(`create policy "${esc(t)} read" on ${q} for select to authenticated using \\(true\\);`))
    const write = change.search(new RegExp(`create policy "${esc(t)} write" on ${q} for all to authenticated using \\(public\\.is_app_supervisor\\(\\)\\) with check \\(public\\.is_app_supervisor\\(\\)\\);`))
    for (const i of [dropRead, dropWrite, read, write]) expect(i).toBeGreaterThan(-1)
    expect(read).toBeGreaterThan(dropRead)
    expect(write).toBeGreaterThan(dropWrite)
  })

  it('exactly 20 tables get read + write policies', () => {
    expect((change.match(/create policy "[^"]+ read"/g) ?? []).length).toBe(20)
    expect((change.match(/create policy "[^"]+ write"/g) ?? []).length).toBe(20)
    expect((change.match(/for all to authenticated using \(true\)/g) ?? []).length).toBe(0) // no full access left
  })

  it('raw materials master: lock policy for 036 FOR UPDATE -- lockable, never writable', () => {
    const drop = change.indexOf('drop policy if exists "raw materials master lock" on public."raw materials master";')
    const create = change.indexOf('create policy "raw materials master lock" on public."raw materials master" for update to authenticated using (true) with check (false);')
    expect(drop).toBeGreaterThan(-1)
    expect(create).toBeGreaterThan(drop)
    expect((change.match(/with check \(false\)/g) ?? []).length).toBe(1)
  })

  it("delivery addresses: 042's read / insert / update policies dropped", () => {
    for (const p of ['read', 'insert', 'update']) {
      expect(change).toContain(`drop policy if exists "authenticated ${p} customer delivery addresses" on public."customer delivery addresses";`)
    }
  })

  it('transaction tables are not touched', () => {
    for (const t of TRANSACTIONS) expect(change).not.toContain(`"${t}"`)
  })

  it('PREVIEW checks is_app_supervisor and live writers; VERIFICATION checks policies + RLS', () => {
    expect(section('PREVIEW')).toMatch(/pg_get_functiondef\('public\.is_app_supervisor\(\)'::regprocedure\)/)
    expect(section('PREVIEW')).toMatch(/from pg_policies/)
    expect(section('PREVIEW')).toMatch(/prosecdef/)
    expect(section('VERIFICATION')).toMatch(/from pg_policies/)
    expect(section('VERIFICATION')).toMatch(/not c\.relrowsecurity/)
  })

  it('ROLLBACK recreates "authenticated full access" on 19 tables and 042\'s policies on delivery addresses', () => {
    for (const t of MASTERS.filter((x) => x !== 'customer delivery addresses')) {
      expect(rollback).toContain(`create policy "authenticated full access" on public."${t}" for all to authenticated using (true) with check (true);`)
    }
    expect(rollback).toContain('drop policy if exists "raw materials master lock"')
    for (const p of ['read', 'insert', 'update']) {
      expect(rollback).toContain(`create policy "authenticated ${p} customer delivery addresses"`)
    }
  })
})
