import bmlhLogo from '../assets/bmlh-logo.png'
import pragatiUnnatiLogo from '../assets/pragati-unnati-logo.png'
import { createContext, useContext } from 'react'
import { ChevronRight } from 'lucide-react'

// App wraps every module in this provider with its breadcrumb trail
// (module > screen, from NAV_ITEMS); Masters overrides it with its own so
// the "Masters" crumb can return to the tile landing.
//   [{ label, onClick? }, ...] -- items with onClick render as links.
const PageHeaderBandContext = createContext(null)

export function PageHeaderBandProvider({ breadcrumb, children }) {
  return <PageHeaderBandContext.Provider value={{ breadcrumb }}>{children}</PageHeaderBandContext.Provider>
}

// "Developed by" Pragati & Unnati left, navy diagonal title band (title +
// subtitle tags) centre, BMLH logo right, breadcrumb row underneath.
function BandHeader({ title, subtitle, breadcrumb }) {
  const tags = subtitle ? subtitle.split('|').map((t) => t.trim()).filter(Boolean) : []
  return (
    <div className="shrink-0">
      <header className="relative flex h-[78px] items-stretch overflow-hidden border-b border-[#DCE4ED] bg-white">
        <div className="z-10 hidden shrink-0 items-center gap-3 pl-5 pr-5 lg:flex">
          <span className="text-[12px] text-slate-600">Developed by</span>
          <img src={pragatiUnnatiLogo} alt="Pragati & Unnati" className="h-[70px] w-auto object-contain" />
        </div>
        <div
          className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 bg-[#12305F] px-10 text-white sm:px-12"
          style={{ clipPath: 'polygon(42px 0, 100% 0, calc(100% - 42px) 100%, 0 100%)' }}
        >
          <h1 className="w-full truncate text-center text-[17px] font-bold leading-tight tracking-tight sm:text-[22px] 2xl:text-[26px]">
            {title}
          </h1>
          {tags.length > 0 && (
            <div className="hidden max-w-full flex-wrap justify-center gap-1.5 overflow-hidden sm:flex sm:max-h-[24px]">
              {tags.map((tag) => (
                <span key={tag} className="whitespace-nowrap rounded-sm bg-[#0D52A7] px-2 py-0.5 text-[12.5px] leading-tight text-white">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="z-10 flex shrink-0 items-center pl-3 pr-3 sm:pl-5 sm:pr-5">
          <img src={bmlhLogo} alt="BMLH Engineering" className="h-11 w-auto max-w-[150px] object-contain sm:h-[64px]" />
        </div>
      </header>
      {breadcrumb?.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 border-b border-slate-200 bg-white px-4 py-1.5 text-[12px] text-slate-500 sm:px-6">
          {breadcrumb.map((crumb, i) => {
            const last = i === breadcrumb.length - 1
            return (
              <span key={crumb.label} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={12} aria-hidden="true" />}
                {crumb.onClick && !last ? (
                  <button type="button" onClick={crumb.onClick} className="text-slate-700 hover:text-[#176FA8] hover:underline">
                    {crumb.label}
                  </button>
                ) : (
                  <span className={last ? 'font-semibold text-slate-800' : 'text-slate-700'} aria-current={last ? 'page' : undefined}>
                    {crumb.label}
                  </span>
                )}
              </span>
            )
          })}
        </nav>
      )}
    </div>
  )
}

// Every screen's header: the client-deck band. Callers' `eyebrow` prop is no
// longer shown -- the breadcrumb row replaces it.
export default function PageHeader({ title, subtitle }) {
  const band = useContext(PageHeaderBandContext)
  return <BandHeader title={title} subtitle={subtitle} breadcrumb={band?.breadcrumb} />
}
