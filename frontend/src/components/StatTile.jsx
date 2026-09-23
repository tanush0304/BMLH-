export default function StatTile({ label, value, icon: Icon, accent = 'text-bmlhblue', onClick, loading }) {
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      onClick={onClick}
      className={`bg-white border border-gray-200 rounded-md p-5 flex items-center gap-4 text-left w-full ${
        onClick ? 'hover:border-bmlhblue/40 hover:shadow-sm transition-shadow cursor-pointer' : ''
      }`}
    >
      {Icon && (
        <div className={`shrink-0 w-11 h-11 rounded-full bg-sky-50 flex items-center justify-center ${accent}`}>
          <Icon size={20} />
        </div>
      )}
      <div className="min-w-0">
        <div className="text-2xl font-semibold text-ink leading-tight">
          {loading ? '—' : value}
        </div>
        <div className="text-sm text-gray-500">{label}</div>
      </div>
    </Wrapper>
  )
}
