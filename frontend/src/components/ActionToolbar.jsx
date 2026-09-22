import { Plus, Save, Pencil, Trash2, X, Search, Download } from 'lucide-react'

const BUTTON_BASE =
  'inline-flex items-center gap-1.5 px-3.5 py-2 rounded text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors'

export default function ActionToolbar({
  onNew,
  onSave,
  onEdit,
  onDelete,
  onClear,
  canSave = true,
  canEdit = true,
  canDelete = true,
  searchValue = '',
  onSearchChange,
  onSearch,
  searchPlaceholder = 'Search...',
  showExport = true,
  onExport,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 bg-white border-b border-gray-200 px-6 py-3">
      <button className={`${BUTTON_BASE} bg-green-600 text-white hover:bg-green-700`} onClick={onNew}>
        <Plus size={16} /> New
      </button>
      <button
        className={`${BUTTON_BASE} bg-blue-700 text-white hover:bg-blue-800`}
        onClick={onSave}
        disabled={!canSave}
      >
        <Save size={16} /> Save
      </button>
      <button
        className={`${BUTTON_BASE} bg-gray-400 text-white hover:bg-gray-500`}
        onClick={onEdit}
        disabled={!canEdit}
      >
        <Pencil size={16} /> Edit
      </button>
      <button
        className={`${BUTTON_BASE} bg-gray-400 text-white hover:bg-red-600`}
        onClick={onDelete}
        disabled={!canDelete}
      >
        <Trash2 size={16} /> Delete
      </button>
      <button className={`${BUTTON_BASE} bg-gray-300 text-gray-800 hover:bg-gray-400`} onClick={onClear}>
        <X size={16} /> Clear
      </button>

      <div className="w-px self-stretch bg-gray-200 mx-1" />

      <div className="flex items-center gap-2 flex-1 min-w-[220px] max-w-sm">
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange?.(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch?.()}
          placeholder={searchPlaceholder}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bmlhblue/30"
        />
      </div>
      <button className={`${BUTTON_BASE} bg-bmlhblue text-white hover:bg-[#163a63]`} onClick={onSearch}>
        <Search size={16} /> Search
      </button>

      {showExport && (
        <button
          className={`${BUTTON_BASE} bg-sky-100 text-bmlhblue hover:bg-sky-200 ml-auto`}
          onClick={onExport}
        >
          <Download size={16} /> Export
        </button>
      )}
    </div>
  )
}
