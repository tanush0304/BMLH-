import { Component } from 'react'
import { ArrowLeft, TriangleAlert } from 'lucide-react'

/**
 * Wraps one report screen (ReportsModule): a render crash shows "This report
 * couldn't load" with a Back button (to the Reports landing) instead of a
 * white page, and logs the error to the console. ReportsModule keys it by
 * report, so opening another report starts clean.
 */
export default class ReportErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error(`Report "${this.props.reportKey ?? ''}" crashed:`, error, info?.componentStack ?? '')
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 bg-[#F5F7FA] p-6 text-center">
        <TriangleAlert size={36} className="text-amber-500" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-[#0B2A5B]">This report couldn&apos;t load</h2>
        <p className="max-w-md text-sm text-slate-600">Something went wrong while showing this report. Go back and try again; if it keeps happening, tell the system administrator.</p>
        <button
          type="button"
          onClick={this.props.onBack}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#1E6FE8] px-6 text-[14px] font-semibold text-white shadow-sm hover:bg-[#165BC4]"
        >
          <ArrowLeft size={16} /> Back
        </button>
      </div>
    )
  }
}
