// components/role.js
//
// Tracks whether the signed-in user can write (editor) or only read
// (viewer), so the UI can hide/disable controls accordingly. This is
// purely a UI convenience for a nicer read-only experience — the real
// enforcement is server-side Row Level Security (see supabase/schema.sql),
// so a bug here can't turn into a security hole, just a confusing button.
import { getMyRole } from '../api.supabase.js'

let currentRole = 'editor' // default: full UI until we know otherwise

export function isEditor () {
  return currentRole === 'editor'
}

export async function loadRole () {
  const role = await getMyRole()
  currentRole = role === 'viewer' ? 'viewer' : 'editor'
  return currentRole
}
