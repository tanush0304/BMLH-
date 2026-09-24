import bmlhLogo from '../assets/bmlh-logo.png'

export default function PageHeader({ title, subtitle }) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-bmlhblue to-bmlhnavy text-white px-6 py-4">
      <div className="absolute right-0 top-0 h-full w-32 bg-white/10 skew-x-[-18deg] origin-top-right pointer-events-none" />
      <div className="relative flex items-center gap-3">
        <img src={bmlhLogo} alt="BMLH" className="h-10 w-auto rounded bg-white/95 p-0.5 shrink-0" />
        <div>
          <h1 className="text-[22px] font-bold tracking-wide leading-tight">{title}</h1>
          {subtitle && <p className="text-[13px] text-white/80 mt-0.5">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}
