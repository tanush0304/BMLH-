import { useEffect, useRef, useState } from 'react'
import { Plus, Save, Pencil, Trash2, X, Printer, ChevronDown, FileSpreadsheet, FileText } from 'lucide-react'

// Client-deck toolbar: New (green) . Save (blue) . Edit / Delete / Clear (grey)
// . Print (Excel / PDF). Searching lives in each screen's RecordsList. Behaviour is unchanged from the old toolbar:
// same props, same handlers -- Print is the old Export menu restyled, and is
// shown disabled on screens that opt out of export (showExport={false}).
const BTN =
  'inline-flex h-9 min-w-[96px] items-center justify-center gap-2 rounded-lg px-4 text-[13.5px] font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1669E0] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60'
const BTN_GREEN = `${BTN} bg-[#1E9E4A] text-white hover:bg-[#17843D] disabled:hover:bg-[#1E9E4A]`
const BTN_BLUE = `${BTN} bg-[#1669E0] text-white hover:bg-[#0F57C2] disabled:hover:bg-[#1669E0]`
const BTN_GREY = `${BTN} bg-[#8C98A8] text-white hover:bg-[#76828F] disabled:hover:bg-[#8C98A8]`
const BTN_LIGHT = `${BTN} min-w-[120px] border border-[#A9C6EE] bg-[#E6F0FD] text-[#0B2A5B] hover:bg-[#D6E6FB] disabled:hover:bg-[#E6F0FD]`

export default function ActionToolbar({
  showCrudButtons = true,
  onNew,
  onSave,
  onEdit,
  onDelete,
  onClear,
  canSave = true,
  canEdit = true,
  canDelete = true,
  showExport = true,
  onExportExcel,
  onExportPdf,
}) {
  const [printOpen, setPrintOpen] = useState(false)
  const printRef = useRef(null)

  useEffect(() => {
    if (!printOpen) return undefined
    const close = (e) => {
      if (printRef.current && !printRef.current.contains(e.target)) setPrintOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [printOpen])

  return (
    <div
      role="toolbar"
      aria-label="Record actions"
      className="flex flex-wrap items-center gap-2 border-b border-[#D5E3F4] bg-white px-4 py-2"
    >
      {showCrudButtons && (
        <>
          <button type="button" className={BTN_GREEN} onClick={onNew}>
            <Plus size={16} /> New
          </button>
          <button type="button" className={BTN_BLUE} onClick={onSave} disabled={!canSave}>
            <Save size={16} /> Save
          </button>
          <button type="button" className={BTN_GREY} onClick={onEdit} disabled={!canEdit}>
            <Pencil size={16} /> Edit
          </button>
          <button type="button" className={BTN_GREY} onClick={onDelete} disabled={!canDelete}>
            <Trash2 size={16} /> Delete
          </button>
          <button type="button" className={BTN_GREY} onClick={onClear}>
            <X size={16} /> Clear
          </button>
          <span className="mx-1 hidden h-8 w-px bg-[#D5E3F4] sm:block" />
        </>
      )}

      <div className="relative ml-auto" ref={printRef}>
        <button
          type="button"
          className={BTN_LIGHT}
          aria-haspopup="menu"
          aria-expanded={printOpen}
          disabled={!showExport}
          title={showExport ? undefined : 'Print is not available on this screen yet'}
          onClick={() => setPrintOpen((v) => !v)}
        >
          <Printer size={16} /> Print <ChevronDown size={15} />
        </button>
        {showExport && printOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-xl border border-[#D5E3F4] bg-white shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13.5px] text-slate-700 hover:bg-green-50"
              onClick={() => {
                setPrintOpen(false)
                onExportExcel?.()
              }}
            >
              <FileSpreadsheet size={16} className="text-green-700" /> Excel
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-left text-[13.5px] text-slate-700 hover:bg-red-50"
              onClick={() => {
                setPrintOpen(false)
                onExportPdf?.()
              }}
            >
              <FileText size={16} className="text-red-600" /> PDF
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
