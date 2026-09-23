import { supabase } from '../../lib/supabaseClient'

/**
 * "Open" = the order's route card doesn't (yet) have every stage Completed --
 * covers orders with no route card generated at all (nothing to be
 * Completed, so trivially open) and orders mid-route.
 */
export async function countOpenOrders() {
  const [{ data: orders, error: ordersErr }, { data: stages, error: stagesErr }] = await Promise.all([
    supabase.from('customer orders').select('prd_no'),
    supabase.from('production route card stages').select('prd_no, status'),
  ])
  if (ordersErr) throw ordersErr
  if (stagesErr) throw stagesErr

  const stagesByPrd = new Map()
  for (const s of stages) {
    if (!stagesByPrd.has(s.prd_no)) stagesByPrd.set(s.prd_no, [])
    stagesByPrd.get(s.prd_no).push(s.status)
  }

  return orders.filter((o) => {
    const statuses = stagesByPrd.get(o.prd_no)
    return !statuses || !statuses.every((s) => s === 'Completed')
  }).length
}

export async function countPendingStages() {
  const { count, error } = await supabase
    .from('production route card stages')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'Pending')
  if (error) throw error
  return count ?? 0
}

export async function countOverdueJobOrders() {
  const { data, error } = await supabase.from('job order status').select('status')
  if (error) throw error
  return data.filter((r) => r.status === 'Overdue').length
}
