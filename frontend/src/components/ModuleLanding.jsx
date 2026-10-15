import PageHeader from './PageHeader'

// One landing tile, same look as the Masters tiles: pastel card, picture
// (cropped from the client deck) or a large icon on the module's pastel
// colour, and the screen's name from constants.js underneath. The picture
// area takes whatever height the tile has (object-contain keeps the aspect
// ratio); the label keeps a fixed two-line slot below it.
export function LandingTile({ tile, onSelect }) {
  const Icon = tile.icon
  return (
    <button
      type="button"
      onClick={() => onSelect(tile)}
      aria-label={'Open ' + tile.label}
      title={tile.label}
      style={{ backgroundColor: tile.bg }}
      className="group flex h-full min-h-0 w-full min-w-0 flex-col items-stretch overflow-hidden rounded-2xl border border-[#DCE4ED] px-4 pb-3 pt-4 text-center shadow-sm transition duration-150 hover:-translate-y-1 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#176FA8]/50"
    >
      <span className="flex min-h-0 flex-1 items-center justify-center">
        {tile.img ? (
          <img src={tile.img} alt="" loading="lazy" className="block h-full max-h-full w-full object-contain" />
        ) : (
          Icon && <Icon strokeWidth={1.5} style={{ color: tile.iconColor }} className="h-[70%] max-h-[112px] w-auto" aria-hidden="true" />
        )}
      </span>
      <span className="mt-2 flex min-h-[2.5em] shrink-0 items-center justify-center text-balance break-words text-[18px] font-bold leading-tight text-[#0A2266] xl:text-[20px]">
        {tile.label}
      </span>
    </button>
  )
}

/** Columns by tile count: 4 -> 2x2, 5-6 -> 3 per row, 7-8 -> 4 per row
 * (7 = 4 + 3), otherwise one row up to 3, 4 per row beyond 8. */
export function landingGrid(count) {
  const cols = count <= 3 ? Math.max(count, 1) : count === 4 ? 2 : count <= 6 ? 3 : 4
  return { cols, rows: Math.ceil(count / cols) }
}

// Tile size caps (px) and the gap -- the grid never grows past them, so a
// module with 2 screens shows 2 normal-sized tiles, not 2 giant ones.
const TILE_MAX_W = 380
const TILE_MAX_H = 330
const GAP = 20

// Module landing page: every sub-screen as a tile. From lg (1024px) the
// grid is sized from the available height, like the Masters 4x4 grid: rows
// share the content height (capped per tile), so it fits without
// scrolling. Below lg tiles wrap at a fixed height and the page scrolls.
export default function ModuleLanding({ title, subtitle = 'Select a screen to open.', tiles, onSelect }) {
  const { cols, rows } = landingGrid(tiles.length)
  const gridStyle = {
    '--cols': cols,
    '--rows': rows,
    '--max-w': `${cols * TILE_MAX_W + (cols - 1) * GAP}px`,
    '--max-h': `${rows * TILE_MAX_H + (rows - 1) * GAP}px`,
    gap: GAP,
  }
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title={title} subtitle={subtitle} />
      {/* Flex column + m-auto on the grid: centred both ways; scrolls only
          when even the minimum tile height doesn't fit. */}
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#F5F7FA] px-4 py-5 sm:px-6 lg:py-6">
        <div
          style={gridStyle}
          className="m-auto grid w-full max-w-[1200px] auto-rows-[260px] [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] lg:h-full lg:max-h-[var(--max-h)] lg:max-w-[var(--max-w)] lg:auto-rows-auto lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))] lg:[grid-template-rows:repeat(var(--rows),minmax(170px,1fr))]"
        >
          {tiles.map((tile) => (
            <LandingTile key={tile.key} tile={tile} onSelect={onSelect} />
          ))}
        </div>
      </main>
    </div>
  )
}
