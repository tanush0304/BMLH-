// 060_employee_photos.sql: structure checks (the file is run by hand in the
// Supabase SQL editor -- every statement must stand alone).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { photoFolder, photoPath } from './employeePhoto'

const sql = readFileSync(new URL('../../../backend/migrations/060_employee_photos.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n') // CRLF checkout
const strip = (s) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
const code = strip(sql)
const section = (name) => {
  const start = sql.search(new RegExp(`-{10,} ${name}`))
  const rest = sql.slice(start + 1)
  const next = rest.search(/\n-- -{10,} [A-Z]/)
  return next === -1 ? rest : rest.slice(0, next)
}
const change = strip(section('CHANGE'))
const verification = strip(section('VERIFICATION'))
const B = "bucket_id = 'employee-photos' and public.is_app_supervisor()"

describe('060 migration file', () => {
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

  it('bucket: private, 2 MB, JPEG / PNG only; re-runnable (settings re-applied)', () => {
    expect(change).toContain("values ('employee-photos', 'employee-photos', false, 2097152, array['image/jpeg', 'image/png'])")
    expect(change).toMatch(/on conflict \(id\) do update\n\s+set public = false, file_size_limit = 2097152, allowed_mime_types = array\['image\/jpeg', 'image\/png'\];/)
  })

  it('exactly 4 policies, each scoped to the bucket AND is_app_supervisor() (delete too, decision a)', () => {
    expect(change.match(/create policy "[^"]+"/g)).toEqual([
      'create policy "employee-photos read"',
      'create policy "employee-photos upload"',
      'create policy "employee-photos replace"',
      'create policy "employee-photos delete"',
    ])
    expect(change).toContain(`create policy "employee-photos read" on storage.objects for select to authenticated\n  using (${B});`)
    expect(change).toContain(`create policy "employee-photos upload" on storage.objects for insert to authenticated\n  with check (${B});`)
    expect(change).toContain(`create policy "employee-photos replace" on storage.objects for update to authenticated\n  using (${B})\n  with check (${B});`)
    expect(change).toContain(`create policy "employee-photos delete" on storage.objects for delete to authenticated\n  using (${B});`)
    for (const p of ['read', 'upload', 'replace', 'delete']) {
      expect(change.indexOf(`drop policy if exists "employee-photos ${p}" on storage.objects;`)).toBeLessThan(change.indexOf(`create policy "employee-photos ${p}"`))
    }
    expect(change).not.toMatch(/\banon\b|to public/)
    expect(change).not.toMatch(/is_app_admin/)
  })

  it('photo_path on the private table + check = app path rule', () => {
    expect(change).toContain('alter table public."employee private details" add column if not exists photo_path text;')
    expect(change.indexOf('drop constraint if exists employee_private_details_photo_path_check')).toBeLessThan(change.indexOf('add constraint employee_private_details_photo_path_check'))
    expect(change).toContain("regexp_replace(employee_id, '[^A-Za-z0-9_-]', '_', 'g') || '/[0-9]{10,16}\\.jpg$'")
    // the JS twin produces paths the same regex accepts
    const id = 'EMP 01/x'
    expect(photoPath(id, 1763900000123)).toMatch(new RegExp(`^${photoFolder(id)}/[0-9]{10,16}\\.jpg$`))
  })

  it('VERIFICATION: bucket row, the 4 policies, operators have no policy (0 rows), no broad policy', () => {
    expect(verification).toMatch(/from storage\.buckets\nwhere id = 'employee-photos'/)
    expect(verification).toMatch(/not like '%is_app_supervisor\(\)%'/)
    expect(verification).toMatch(/'anon' = any\(roles\) or 'public' = any\(roles\)/)
    expect(verification).toMatch(/not like '%bucket_id%'/)
    expect(verification).toMatch(/employee_private_details_photo_path_check/)
  })

  it('ROLLBACK drops the policies, check and column; bucket left to the dashboard', () => {
    const rb = section('ROLLBACK')
    for (const p of ['read', 'upload', 'replace', 'delete']) expect(rb).toContain(`drop policy if exists "employee-photos ${p}" on storage.objects;`)
    expect(rb).toContain('drop column if exists photo_path;')
    expect(rb).toMatch(/Empty bucket/)
  })
})
