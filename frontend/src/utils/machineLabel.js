// machine_name was briefly non-unique while the demo and real fleets
// coexisted; the fleet has since been reloaded as MC-001..023, real
// machines only, so names are unique again. Dropdowns still show name + id
// together (harmless now, and cheap insurance against this recurring);
// the saved value is still machine_id, this only changes what's displayed.
export function machineOptionLabel(machine) {
  return `${machine.machine_name} (${machine.machine_id})`
}

/** machine_id -> "Name (ID)" label, for dropdowns that only have a flat list
 * of machine_ids (not full machine rows) to build options from. */
export function buildMachineLabelMap(machines) {
  return Object.fromEntries(machines.map((m) => [m.machine_id, machineOptionLabel(m)]))
}
