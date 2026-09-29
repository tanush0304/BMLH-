import bmlhLogo from '../assets/bmlh-logo.png'
import pragatiUnnatiLogo from '../assets/pragati-unnati-logo.png'
import { useModuleTheme } from './ModuleTheme'

// Positions swapped from the original mockup: Pragati & Unnati's logo is now
// primary (top-left), BMLH moves to where P&U's small credit used to sit
// (top-right). If this is backwards from what's wanted, swap the two <img>
// blocks below (and their left/right placement) -- one line to revert.
//
// The gradient shade comes from ModuleThemeProvider (one shade per module,
// see ModuleTheme.jsx) so each module's header is visually distinct at a
// glance -- this is the ONLY place that varies; the outer accent strip
// below and the app's footer bar stay one consistent color everywhere.
export default function PageHeader({ eyebrow, title, subtitle }) {
  const theme = useModuleTheme()
  return (
    <div
      className="relative overflow-hidden text-white px-5 py-2"
      style={{ backgroundImage: `linear-gradient(to right, ${theme.from}, ${theme.to})` }}
    >
      <div className="absolute right-0 top-0 h-full w-32 bg-white/10 skew-x-[-18deg] origin-top-right pointer-events-none" />
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src={pragatiUnnatiLogo} alt="Pragati & Unnati" className="h-14 w-auto rounded bg-white/95 p-1 shrink-0" />
          <div>
            {eyebrow && <p className="text-[9px] uppercase tracking-wider text-white/70 leading-tight">{eyebrow}</p>}
            <h1 className="text-[18px] font-bold tracking-wide leading-tight">{title}</h1>
            {subtitle && <p className="text-[11px] text-white/80 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <img src={bmlhLogo} alt="BMLH" className="h-14 w-auto rounded bg-white/95 p-1 shrink-0" />
      </div>
    </div>
  )
}
