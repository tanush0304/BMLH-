import { describe, expect, it } from 'vitest'
import { authTransition } from './authTransition'

const session = (id, token = 't1') => ({ access_token: token, user: { id, email: id + '@x.com' } })

// Replays a sequence of auth events the way App does: the user id carried
// forward between events, and whether each event sends the user to the Main
// Menu / re-runs the role lookup (userChanged).
function replay(events) {
  let userId = null
  return events.map((s) => {
    const t = authTransition(userId, s)
    userId = t.userId
    return t
  })
}

describe('authTransition', () => {
  it('TOKEN_REFRESHED for the same user keeps the screen and the role', () => {
    const [, refreshed] = replay([session('u1', 'old'), session('u1', 'new')])
    expect(refreshed.goToMainMenu).toBe(false)
    expect(refreshed.userChanged).toBe(false)
  })

  it('repeat SIGNED_IN for the same user (tab refocus) keeps the screen and the role', () => {
    const steps = replay([session('u1'), session('u1'), session('u1')])
    expect(steps.slice(1).every((t) => !t.goToMainMenu && !t.userChanged)).toBe(true)
  })

  it('sign-out then sign-in goes to the Main Menu', () => {
    const [signedIn, signedOut, signedInAgain] = replay([session('u1'), null, session('u1')])
    expect(signedIn.goToMainMenu).toBe(true)
    expect(signedOut).toEqual({ userId: null, userChanged: true, goToMainMenu: false })
    expect(signedInAgain.goToMainMenu).toBe(true)
  })

  it('a different user goes to the Main Menu', () => {
    const [, other] = replay([session('u1'), session('u2')])
    expect(other.goToMainMenu).toBe(true)
    expect(other.userChanged).toBe(true)
  })
})
