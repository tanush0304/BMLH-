// machine_name is no longer guaranteed unique -- the real 46-machine fleet
// loaded alongside the demo/pilot data shares several names (e.g. two
// different "CNC 1" rows). Every machine-selection dropdown shows name + id
// together so it's unambiguous which machine is actually being picked; the
// saved value is still machine_id, this only changes what's displayed.
export function machineOptionLabel(machine) {
  return `${machine.machine_name} (${machine.machine_id})`
}

/** machine_id -> "Name (ID)" label, for dropdowns that only have a flat list
 * of machine_ids (not full machine rows) to build options from. */
export function buildMachineLabelMap(machines) {
  return Object.fromEntries(machines.map((m) => [m.machine_id, machineOptionLabel(m)]))
}
