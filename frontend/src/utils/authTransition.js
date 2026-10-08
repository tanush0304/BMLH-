// Decides what an auth event means for the app, from the user id alone.
// Supabase fires TOKEN_REFRESHED about once an hour and a repeat SIGNED_IN
// every time the tab becomes visible again -- for the same user those must
// not reset the screen, the form state, or the role lookup. Only a real
// change of user (signed out -> signed in, or a different account) goes to
// the Main Menu; signing out clears the session (App shows Login).
export function authTransition(prevUserId, session) {
  const userId = session?.user?.id ?? null
  return {
    userId,
    userChanged: userId !== prevUserId,
    goToMainMenu: userId !== null && userId !== prevUserId,
  }
}
