export function exportToCsv(columns, rows, filename) {
  const header = columns.map((c) => c.label).join(',')
  const body = rows.map((r) => columns.map((c) => r[c.key] ?? '').join(','))
  const csv = [header, ...body].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** No PDF library dependency -- opens a print-formatted window and lets the
 * browser's own "Save as PDF" print destination do the actual PDF creation. */
export function exportToPdf(columns, rows, title, filename) {
  const win = window.open('', '_blank')
  if (!win) return

  const headerHtml = columns.map((c) => `<th>${c.label}</th>`).join('')
  const rowsHtml = rows
    .map((r) => `<tr>${columns.map((c) => `<td>${r[c.key] ?? ''}</td>`).join('')}</tr>`)
    .join('')

  win.document.write(`
    <html>
      <head>
        <title>${filename}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; }
          h1 { font-size: 16px; margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; }
          th { background: #f0f4fa; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>
        <script>window.onload = () => window.print()</script>
      </body>
    </html>
  `)
  win.document.close()
}
