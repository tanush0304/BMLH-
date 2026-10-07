import { useState } from 'react'
import { LogIn, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import pragatiUnnatiLogo from '../assets/pragati-unnati-logo.png'
import bmlhLogo from '../assets/bmlh-logo.png'
import loginBackground from '../assets/login-background.jpg'

export default function LoginScreen() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error, data } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (!data.session) {
          setNotice('Account created. Check your email to confirm, then sign in.')
          setMode('signin')
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-x-hidden bg-[#0D2B5C] bg-cover bg-center px-5 py-8 sm:px-8 lg:overflow-hidden lg:py-0"
      style={{ backgroundImage: `url(${loginBackground})` }}
    >
      <div className="absolute inset-0 bg-[#082754]/10" />
      <div className="relative grid min-h-[calc(100vh-4rem)] w-full max-w-[1440px] grid-cols-1 content-center lg:min-h-screen">
        <img
          src={pragatiUnnatiLogo}
          alt="Pragati & Unnati — Together Towards a Better Tomorrow"
          className="absolute left-0 top-0 w-[210px] max-w-[42vw] rounded bg-white/95 p-1.5 shadow-lg sm:left-2 sm:top-1 sm:w-[250px] lg:left-[3.5%] lg:top-[7.5%] lg:w-[250px]"
        />
        <img
          src={bmlhLogo}
          alt="BMLH Engineering"
          className="absolute right-0 top-0 w-[118px] rounded bg-white/95 p-1 shadow-lg sm:right-2 sm:top-1 sm:w-[150px] lg:right-[2.5%] lg:top-[5.5%] lg:w-[205px]"
        />

        <div className="mx-auto w-full max-w-[760px] pt-28 sm:pt-32 lg:ml-[30%] lg:mr-0 lg:max-w-[760px] lg:pt-0">
          <h1 className="text-center text-[28px] font-semibold leading-tight tracking-wide text-white drop-shadow sm:text-4xl lg:text-left lg:text-[42px]">
            Data Management System
          </h1>

          <form onSubmit={handleSubmit} className="mx-auto mt-10 w-full max-w-[610px] space-y-5 lg:mx-0 lg:ml-[-5%] lg:mt-20">
            {error && (
              <div role="alert" className="rounded-md border border-red-200 bg-white/95 px-3.5 py-3 text-sm text-red-700 shadow-sm">{error}</div>
            )}
            {notice && (
              <div role="status" className="rounded-md border border-green-200 bg-white/95 px-3.5 py-3 text-sm text-green-800 shadow-sm">{notice}</div>
            )}

            <label className="grid gap-2 text-sm font-semibold text-white drop-shadow sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center sm:gap-5">
              <span>Employee ID</span>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your employee ID"
                aria-label="Employee ID"
                className="min-w-0 rounded-md border border-white/70 bg-white px-4 py-3 text-sm font-normal text-[#16365E] shadow-[0_4px_14px_rgba(5,25,58,0.14)] outline-none transition placeholder:text-[#8A9AAF] hover:border-white focus:border-[#8FE06A] focus:ring-4 focus:ring-[#8FE06A]/25"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-white drop-shadow sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center sm:gap-5">
              <span>Password</span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                aria-label="Password"
                className="min-w-0 rounded-md border border-white/70 bg-white px-4 py-3 text-sm font-normal text-[#16365E] shadow-[0_4px_14px_rgba(5,25,58,0.14)] outline-none transition placeholder:text-[#8A9AAF] hover:border-white focus:border-[#8FE06A] focus:ring-4 focus:ring-[#8FE06A]/25"
              />
            </label>

            <div className="pt-2 sm:pl-[200px]">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#8FE06A] px-5 py-3 text-sm font-bold text-[#10365B] shadow-[0_6px_20px_rgba(4,23,52,0.22)] transition hover:bg-[#A1EB80] focus:outline-none focus:ring-4 focus:ring-white/40 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[180px]"
              >
                {mode === 'signin' ? <LogIn size={17} /> : <UserPlus size={17} />}
                {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin')
                setError(null)
                setNotice(null)
              }}
              className="w-full text-center text-sm font-medium text-white/90 underline decoration-white/40 underline-offset-4 transition hover:text-white focus:outline-none focus:underline"
            >
              {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
