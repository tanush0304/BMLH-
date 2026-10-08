import PageHeader from './PageHeader'

// One landing tile, same look as the Masters tiles: pastel card, picture
// (cropped from the client deck) or a large icon on the module's pastel
// colour, and the screen's name from constants.js underneath. Picture and
// icon tiles share one fixed shape so a grid never looks uneven.
export function LandingTile({ tile, onSelect }) {
  const Icon = tile.icon
  return (
    <button
      type="button"
      onClick={() => onSelect(tile)}
      aria-label={'Open ' + tile.label}
      title={tile.label}
      style={{ backgroundColor: tile.bg }}
      className="group flex w-full flex-col items-stretch overflow-hidden rounded-2xl border border-[#DCE4ED] px-4 pb-4 pt-5 text-center shadow-sm transition duration-150 hover:-translate-y-1 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#176FA8]/50"
    >
      <span className="flex h-[200px] items-center justify-center">
        {tile.img ? (
          <img src={tile.img} alt="" loading="lazy" className="block h-full w-full object-contain" />
        ) : (
          Icon && <Icon size={112} strokeWidth={1.5} style={{ color: tile.iconColor }} aria-hidden="true" />
        )}
      </span>
      <span className="mt-3 flex min-h-[2.5em] items-center justify-center text-balance break-words text-[20px] font-bold leading-tight text-[#0A2266]">
        {tile.label}
      </span>
    </button>
  )
}

// 4 tiles -> 2x2 square; anything else keeps the auto-fit row(s). Tile
// width range (280-380px) is the same either way.
function gridColumns(count) {
  return count === 4
    ? '[grid-template-columns:minmax(280px,380px)] sm:[grid-template-columns:repeat(2,minmax(280px,380px))]'
    : '[grid-template-columns:repeat(auto-fit,minmax(280px,380px))]'
}

// Module landing page: every sub-screen as a tile. Tiles keep a fixed
// maximum width (280-380px) and the grid is centred, so a module with 2 screens shows
// 2 normal-sized tiles rather than 2 stretched ones.
export default function ModuleLanding({ title, subtitle = 'Select a screen to open.', tiles, onSelect }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={title} subtitle={subtitle} />
      {/* Flex column + m-auto on the grid: the tiles sit in the middle of
          the content area both ways with equal space around them, and the
          auto margins collapse to 0 (normal scrolling) when they don't fit. */}
      <main className="flex flex-1 flex-col overflow-y-auto bg-[#F5F7FA] px-4 py-8 sm:px-6">
        <div className={`m-auto grid w-full max-w-[1600px] justify-center gap-6 ${gridColumns(tiles.length)}`}>
          {tiles.map((tile) => (
            <LandingTile key={tile.key} tile={tile} onSelect={onSelect} />
          ))}
        </div>
      </main>
    </div>
  )
}
