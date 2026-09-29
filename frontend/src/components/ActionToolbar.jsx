import { Plus, Save, Pencil, Trash2, X, Search, Download, ChevronDown } from 'lucide-react'

const BUTTON_BASE =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:hover:bg-gray-200'

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
  searchValue = '',
  onSearchChange,
  onSearch,
  searchPlaceholder = 'Search...',
  showExport = true,
  onExport,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 bg-white border-b border-gray-200 px-5 py-2">
      {showCrudButtons && (
        <>
          <button className={`${BUTTON_BASE} bg-green-600 text-white hover:bg-green-700`} onClick={onNew}>
            <Plus size={16} /> New
          </button>
          <button
            className={`${BUTTON_BASE} bg-bmlhblue text-white hover:bg-[#163d70]`}
            onClick={onSave}
            disabled={!canSave}
          >
            <Save size={16} /> Save
          </button>
          <button
            className={`${BUTTON_BASE} bg-bmlhslate text-white hover:bg-[#767e8c]`}
            onClick={onEdit}
            disabled={!canEdit}
          >
            <Pencil size={16} /> Edit
          </button>
          <button
            className={`${BUTTON_BASE} bg-bmlhslate text-white hover:bg-red-600`}
            onClick={onDelete}
            disabled={!canDelete}
          >
            <Trash2 size={16} /> Delete
          </button>
          <button className={`${BUTTON_BASE} bg-gray-200 text-gray-700 hover:bg-gray-300`} onClick={onClear}>
            <X size={16} /> Clear
          </button>

          <div className="w-px self-stretch bg-gray-200 mx-1" />
        </>
      )}

      <div className="flex items-center gap-2 flex-1 min-w-[220px] max-w-sm">
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange?.(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch?.()}
          placeholder={searchPlaceholder}
          className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-bmlhblue/30"
        />
      </div>
      <button className={`${BUTTON_BASE} bg-bmlhnavy text-white hover:bg-[#0a1d3a]`} onClick={onSearch}>
        <Search size={16} /> Search
      </button>

      {showExport && (
        <button
          className={`${BUTTON_BASE} bg-bmlhsky text-bmlhblue hover:bg-[#c9def6] ml-auto`}
          onClick={onExport}
        >
          <Download size={16} /> Export <ChevronDown size={14} />
        </button>
      )}
    </div>
  )
}
