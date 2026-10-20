import { ChevronRight } from 'lucide-react'
import PageHeader from '../PageHeader'

/**
 * One report card, as on the deck's Reports & Dashboard slide: pastel card,
 * bold title in the card's accent colour, short description, a "View
 * Report ›" pill in the same colour, illustration on the right. The whole
 * card is one button.
 *   tile: { key, label, description, img, bg, accent }
 */
export function ReportCard({ tile, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(tile)}
      aria-label={'Open ' + tile.label}
      title={tile.label}
      style={{ backgroundColor: tile.bg }}
      className="group flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-white/70 px-5 pb-4 pt-4 text-left shadow-[0_2px_8px_rgba(16,60,120,0.10)] transition duration-150 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#176FA8]/50"
    >
      {/* Title across the card; below it the description + pill (left) and the illustration (right). */}
      <span className="truncate text-[clamp(17px,1.4vw,24px)] font-extrabold leading-tight tracking-[-0.01em]" style={{ color: tile.accent }}>
        {tile.label}
      </span>
      <span className="mt-1.5 flex min-h-0 flex-1 gap-3">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[clamp(13px,1.05vw,16px)] leading-snug text-slate-700">{tile.description}</span>
          <span
            className="mt-auto inline-flex w-fit items-center gap-4 rounded-full py-2 pl-5 pr-2 text-[15px] font-bold"
            style={{ backgroundColor: `${tile.accent}1F`, color: tile.accent }}
          >
            View Report
            <span className="flex h-7 w-7 items-center justify-center rounded-full text-white transition group-hover:translate-x-0.5" style={{ backgroundColor: tile.accent }}>
              <ChevronRight size={16} strokeWidth={3} aria-hidden="true" />
            </span>
          </span>
        </span>
        <img src={tile.img} alt="" loading="lazy" className="block h-full w-[44%] max-w-[230px] shrink-0 object-contain object-right" />
      </span>
    </button>
  )
}

/**
 * Reports & Dashboard landing: the report cards (9 from the deck + Customer
 * Complaint), 3 per row on wide screens. Each row is a third of the height
 * left under the header (min 170px) -- the card size from when there were 9
 * cards -- so the 10th card starts a 4th row of the same size and the page
 * scrolls instead of every card shrinking. 2 columns on narrower screens,
 * 1 on phones.
 */
export default function ReportLanding({ title, subtitle = 'Operations, production, quality and inventory at a glance.', tiles, onSelect }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={title} subtitle={subtitle} />
      <main className="min-h-0 flex-1 overflow-y-auto bg-[#F5F7FA] p-4 sm:p-5">
        <div className="mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-4 [grid-auto-rows:190px] md:grid-cols-2 xl:h-full xl:grid-cols-3 xl:[grid-auto-rows:max(170px,calc((100%_-_2rem)/3))]">
          {tiles.map((tile) => (
            <ReportCard key={tile.key} tile={tile} onSelect={onSelect} />
          ))}
        </div>
      </main>
    </div>
  )
}
