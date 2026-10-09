import { useState } from 'react'
import { LogIn } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import pragatiUnnatiLogo from '../assets/pragati-unnati-logo.png'
import loginBackground from '../assets/login-background.jpg'
import growthArrow from '../assets/login-growth-arrow.png'

const INPUT_CLASS = 'min-w-0 rounded-md border border-white/70 bg-white px-4 py-3 text-sm font-normal text-[#16365E] shadow-[0_4px_14px_rgba(5,25,58,0.14)] outline-none transition placeholder:text-[#8A9AAF] hover:border-white focus:border-[#8FE06A] focus:ring-4 focus:ring-[#8FE06A]/25'
const ROW_CLASS = 'grid gap-2 text-lg text-white drop-shadow sm:grid-cols-[170px_minmax(0,1fr)] sm:items-center sm:gap-5 sm:text-xl'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main
      className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#0D2B5C] bg-cover bg-center px-4 py-4 sm:px-6 sm:py-6"
      style={{ backgroundImage: `url(${loginBackground})` }}
    >
      <div className="absolute inset-0 bg-[#082754]/10" />

      {/* Top row: logo card, title + tagline and growth arrow share the same
          top line; the arrow matches the card's 78px height (70px logo +
          py-1), mirrored from the right edge. Stacks on phones. */}
      <header className="relative flex flex-col items-center gap-4 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-start sm:gap-6">
        {/* Same logo size as the module page header (PageHeader: h-[70px]). */}
        <div className="rounded-lg bg-white px-3 py-1 shadow-lg sm:justify-self-start">
          <img src={pragatiUnnatiLogo} alt="Pragati & Unnati" className="h-[70px] w-auto object-contain" />
        </div>
        <div className="max-w-[640px] text-center">
          <h1 className="text-4xl font-bold leading-none tracking-wide text-white drop-shadow sm:text-5xl lg:text-[60px]">Pragati &amp; Unnati</h1>
          <p className="mx-auto mt-3 max-w-[560px] text-base text-[#D8E5F7] drop-shadow sm:text-[22px] sm:leading-snug">
            Building a Strong Operational Foundation for Sustainable Growth &amp; Expansion
          </p>
        </div>
        <img src={growthArrow} alt="" aria-hidden="true" className="pointer-events-none hidden h-[78px] w-auto sm:block sm:justify-self-end" />
      </header>

      <div className="relative flex flex-1 items-center justify-center py-8">
        <div className="w-full max-w-[640px] text-center">
          <h2 className="text-3xl font-bold text-white drop-shadow sm:text-[44px]">Data Management System</h2>

        <form onSubmit={handleSubmit} className="mx-auto mt-8 w-full max-w-[520px] space-y-5 text-left">
          {error && (
            <div role="alert" className="rounded-md border border-red-200 bg-white/95 px-3.5 py-3 text-sm text-red-700 shadow-sm">{error}</div>
          )}

          <label className={ROW_CLASS}>
            <span>Employee ID</span>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your employee ID"
              aria-label="Employee ID"
              className={INPUT_CLASS}
            />
          </label>

          <label className={ROW_CLASS}>
            <span>Password</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              aria-label="Password"
              className={INPUT_CLASS}
            />
          </label>

          {/* Button sits under the input column: same left edge and width. */}
          <div className="grid gap-2 pt-2 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-5">
            <span aria-hidden="true" className="hidden sm:block" />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#00B050] px-5 py-3 text-base font-semibold text-white shadow-[0_6px_20px_rgba(4,23,52,0.22)] transition hover:bg-[#00C55A] focus:outline-none focus:ring-4 focus:ring-white/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogIn size={17} />
              {loading ? 'Please wait...' : 'Sign in'}
            </button>
          </div>
        </form>
        </div>
      </div>
    </main>
  )
}
