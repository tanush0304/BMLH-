/** Dropdown options for parts: value = part_serial_number (unchanged),
 * label = "serial – name" so the searchable dropdown matches on either. */
export function productOptions(products) {
  return products.map((p) => ({
    value: p.part_serial_number,
    label: p.part_name ? `${p.part_serial_number} – ${p.part_name}` : p.part_serial_number,
  }))
}
