export default function PageHeader({ title, subtitle }) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-[#123A6B] to-bmlhblue text-white px-8 py-5">
      <div className="absolute right-0 top-0 h-full w-40 bg-white/10 skew-x-[-20deg] origin-top-right pointer-events-none" />
      <div className="relative">
        <h1 className="text-2xl font-bold tracking-wide">{title}</h1>
        {subtitle && <p className="text-sm text-white/80 mt-1">{subtitle}</p>}
      </div>
    </div>
  )
}
