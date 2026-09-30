import PageHeader from './PageHeader'

export default function ComingSoon({ title, subtitle = 'This screen is not built yet.' }) {
  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <PageHeader title={title} subtitle={subtitle} />
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm bg-[#F5F7FA]">
        Coming soon.
      </div>
    </div>
  )
}
