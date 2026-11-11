// Global test guard: tests must NEVER reach the network (2026-11-11).
//
// Any fetch to an http(s) URL -- in practice the live Supabase project, since
// src/lib/supabaseClient.js builds a real client from .env -- throws at once
// with a clear message. Supabase turns a failed fetch into a { error } result
// that a screen may swallow, so every attempt is also recorded and the test
// is failed in afterEach. Fix a failing test by mocking its query modules
// (or `../../lib/supabaseClient`), never by loosening this guard.
import { afterEach, beforeEach } from 'vitest'

const attempts = []

function urlOf(input) {
  if (typeof input === 'string') return input
  if (input && typeof input.url === 'string') return input.url
  return String(input)
}

const blockedFetch = async (input) => {
  const url = urlOf(input)
  if (/^https?:\/\//i.test(url)) {
    attempts.push(url)
    throw new Error(`test tried to reach the network: ${url.split('?')[0]}`)
  }
  throw new Error(`test tried to fetch: ${url}`)
}

globalThis.fetch = blockedFetch
if (typeof window !== 'undefined') window.fetch = blockedFetch

/** For the guard's own test only: forget the attempts recorded so far. */
export function forgetNetworkAttempts() {
  attempts.length = 0
}

beforeEach(() => {
  attempts.length = 0
  // a test may replace fetch with its own mock; put the guard back each time
  globalThis.fetch = blockedFetch
  if (typeof window !== 'undefined') window.fetch = blockedFetch
})

afterEach(() => {
  if (attempts.length === 0) return
  const list = [...new Set(attempts.map((u) => u.split('?')[0]))].join('\n  ')
  attempts.length = 0
  throw new Error(`test tried to reach the network (mock its query modules or lib/supabaseClient):\n  ${list}`)
})
