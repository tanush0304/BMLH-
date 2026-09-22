import PageHeader from '../components/PageHeader'

export default function Dashboard() {
  return (
    <div className="flex-1 flex flex-col min-w-0">
      <PageHeader title="Dashboard" subtitle="Overview of shop-floor operations" />
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm bg-[#F5F7FA]">
        Dashboard tiles coming soon.
      </div>
    </div>
  )
}
