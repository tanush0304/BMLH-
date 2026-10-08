import { mergeOptions } from '../components/SelectWithAddNew'

export const BUILT_IN_UOMS = ['Nos', 'Kg', 'Gms', 'Mtr', 'Mm', 'Ltr', 'Set', 'Pcs']

/** Built-in units + every distinct UoM already saved on "products master" and
 * "raw materials master" combined, so a unit added in one shows in both. */
export function uomOptions(products = [], rawMaterials = []) {
  return mergeOptions(BUILT_IN_UOMS, [...products, ...rawMaterials].map((r) => r.unit_of_measurement))
}
