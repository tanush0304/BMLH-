// The global no-network guard (src/test/noNetwork.js) is active in every test file.
import { describe, it, expect } from 'vitest'
import { forgetNetworkAttempts } from './noNetwork'

describe('no-network guard', () => {
  it('any http(s) fetch throws "test tried to reach the network"', async () => {
    await expect(fetch('https://example.supabase.co/rest/v1/x?select=*')).rejects.toThrow(
      'test tried to reach the network: https://example.supabase.co/rest/v1/x',
    )
    forgetNetworkAttempts() // otherwise afterEach fails this test (by design)
  })
})
