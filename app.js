// app.js
import { initScheduleGrid } from './components/scheduleGrid.js'
import { initTeams } from './components/teams.js'
import { initStatuses } from './components/statuses.js'
import { initPeople } from './components/people.js'
import { loadRole, isEditor } from './components/role.js'

import { supabase, getSession, signInWithPassword, signOut, shouldRemember, setRememberMe } from './api.supabase.js'

let appStarted = false
let loginModal

function startAppOnce () {
  if (appStarted) return
  appStarted = true
  initScheduleGrid()
  initTeams()
  initStatuses()
  initPeople()
}

function setLoginError (msg) {
  const el = document.getElementById('loginError')
  if (!el) return
  if (!msg) {
    el.classList.add('d-none')
    el.textContent = ''
  } else {
    el.classList.remove('d-none')
    el.textContent = msg
  }
}

function updateAuthBar (session) {
  const label = document.getElementById('authUserLabel')
  const btn = document.getElementById('btnSignOut')
  const email = session?.user?.email
  const roleSuffix = email && !isEditor() ? ' (Read-only)' : ''

  if (label) label.textContent = email ? `Signed in: ${email}${roleSuffix}` : 'Not signed in'
  if (btn) btn.classList.toggle('d-none', !email)
}

async function ensureSignedIn () {
  let session = null
  try {
    session = await getSession()
  } catch (e) {
    // ignore; we'll just show the login modal
  }

  if (session) {
    await loadRole()
  }
  updateAuthBar(session)

  if (session) {
    setLoginError('')
    if (loginModal) loginModal.hide()
    startAppOnce()
  } else {
    if (loginModal) loginModal.show()
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const modalEl = document.getElementById('loginModal')
  if (modalEl && window.bootstrap?.Modal) {
    loginModal = new window.bootstrap.Modal(modalEl, {
      backdrop: 'static',
      keyboard: false
    })
  }

  const rememberInput = document.getElementById('loginRemember')
  if (rememberInput) rememberInput.checked = shouldRemember()

  const loginForm = document.getElementById('loginForm')
  if (loginForm) {
    loginForm.addEventListener('submit', async e => {
      e.preventDefault()
      setLoginError('')

      const email = document.getElementById('loginEmail')?.value?.trim()
      const password = document.getElementById('loginPassword')?.value

      if (!email || !password) return

      const btn = document.getElementById('btnLoginSubmit')
      if (btn) btn.disabled = true
      try {
        // Set the preference before signing in — Supabase writes the new
        // session to storage as part of this call, and the storage
        // adapter (api.supabase.js) reads the preference at that moment
        // to decide where it goes.
        setRememberMe(rememberInput ? rememberInput.checked : true)
        await signInWithPassword(email, password)
        // Full reload rather than re-running ensureSignedIn(): guarantees
        // every component starts fresh with the right role-based UI,
        // rather than needing every component to react to a role change
        // mid-session (which normally never happens on this app anyway).
        window.location.reload()
      } catch (err) {
        setLoginError(err?.message || 'Unable to sign in.')
        if (btn) btn.disabled = false
      }
    })
  }

  const signOutBtn = document.getElementById('btnSignOut')
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      try {
        await signOut()
      } finally {
        window.location.reload()
      }
    })
  }

  // Keep UI in sync if tabs refresh or token refresh happens
  supabase.auth.onAuthStateChange(() => {
    ensureSignedIn()
  })

  ensureSignedIn()
})
