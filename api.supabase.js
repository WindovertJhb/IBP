// api.supabase.js
//
// Thin data-access layer over Supabase. Every function here maps between
// the DB's snake_case columns and the camelCase shape the UI components use.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js'

// "Remember me" on the login form: localStorage survives closing the
// browser, sessionStorage is cleared with it. Supabase's client picks a
// storage backend once at creation time, so instead of swapping clients
// we hand it a small adapter that checks the user's saved preference on
// every read/write and delegates to whichever backend should currently
// hold the session. The preference flag itself is harmless in
// localStorage either way — it's not the session, just which drawer to
// put the session in.
const REMEMBER_KEY = 'ibp-remember-me'

export function shouldRemember () {
  const v = localStorage.getItem(REMEMBER_KEY)
  return v === null ? true : v === 'true' // default on, matches the old always-persisted behaviour
}

export function setRememberMe (remember) {
  localStorage.setItem(REMEMBER_KEY, remember ? 'true' : 'false')
}

const rememberAwareStorage = {
  getItem: key => (shouldRemember() ? localStorage : sessionStorage).getItem(key),
  setItem: (key, value) => {
    const active = shouldRemember() ? localStorage : sessionStorage
    const inactive = shouldRemember() ? sessionStorage : localStorage
    active.setItem(key, value)
    inactive.removeItem(key) // don't leave a stale copy in the other backend
  },
  removeItem: key => {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: rememberAwareStorage }
})

// --- helpers ---

function unwrap (res) {
  if (res.error) throw res.error
  return res.data
}

function toLocalISO (date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function splitId (idOrPayload, patch) {
  if (typeof idOrPayload === 'object' && idOrPayload) {
    const data = { ...idOrPayload }
    const id = data.id
    delete data.id
    return { id, data }
  }
  return { id: idOrPayload, data: patch || {} }
}

// -------------------- AUTH --------------------

export async function signInWithPassword (email, password) {
  const res = await supabase.auth.signInWithPassword({ email, password })
  return unwrap(res)
}

export async function signOut () {
  const res = await supabase.auth.signOut()
  return unwrap(res)
}

export async function getSession () {
  const res = await supabase.auth.getSession()
  return unwrap(res).session
}

// -------------------- profile / role --------------------
// 'editor' can write, 'viewer' can only read — enforced server-side by
// RLS (see supabase/schema.sql); this is just so the UI can match.

export async function getMyRole () {
  const session = await getSession()
  if (!session) return null
  const res = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
  if (res.error) {
    console.error('Failed to load profile role', res.error)
    return null
  }
  return res.data?.role || null
}

// -------------------- teams --------------------

function teamToRow (t) {
  return {
    id: t.id,
    name: t.name
  }
}

function rowToTeam (r) {
  return {
    id: r.id,
    name: r.name
  }
}

export async function getTeams () {
  const res = await supabase.from('teams').select('*').order('name')
  return unwrap(res).map(rowToTeam)
}

export async function createTeam (payload) {
  const row = teamToRow(payload)
  delete row.id
  const res = await supabase.from('teams').insert([row]).select('*').single()
  return rowToTeam(unwrap(res))
}

export async function updateTeam (idOrPayload, patch) {
  const { id, data } = splitId(idOrPayload, patch)
  if (!id) throw new Error('updateTeam requires an id')
  const row = teamToRow({ id, ...data })
  delete row.id
  const res = await supabase.from('teams').update(row).eq('id', id).select('*').single()
  return rowToTeam(unwrap(res))
}

export async function deleteTeam (id) {
  const res = await supabase.from('teams').delete().eq('id', id)
  return unwrap(res)
}

// -------------------- statuses --------------------
// Booking lifecycle stages (name + colour), fully user-managed from the
// Status tab — nothing here is hardcoded.

export async function getStatuses () {
  const res = await supabase.from('statuses').select('*').order('name')
  return unwrap(res)
}

export async function createStatus (payload) {
  const res = await supabase.from('statuses').insert([payload]).select('*').single()
  return unwrap(res)
}

export async function updateStatus (idOrPayload, patch) {
  const { id, data } = splitId(idOrPayload, patch)
  if (!id) throw new Error('updateStatus requires an id')
  const res = await supabase.from('statuses').update(data).eq('id', id).select('*').single()
  return unwrap(res)
}

export async function deleteStatus (id) {
  const res = await supabase.from('statuses').delete().eq('id', id)
  return unwrap(res)
}

// -------------------- bookings --------------------

function bookingToRow (b) {
  return {
    id: b.id,
    date: b.date,
    team_id: b.teamId,
    start_time: b.startTime,
    duration_hours: b.durationHours,
    customer_name: b.customerName,
    status_id: b.statusId ?? null,
    notes: b.notes,
    address: b.address,
    client_phone: b.clientPhone,
    client_email: b.clientEmail,
    order_numbers: b.orderNumbers,
    products_arrived: b.productsArrived ?? false,
    salesperson_id: b.salesperson_id ?? null
  }
}

function rowToBooking (r) {
  // Strip seconds from time if present (e.g., "08:30:00" -> "08:30")
  let startTime = r.start_time
  if (startTime && startTime.length > 5) {
    startTime = startTime.substring(0, 5)
  }

  return {
    id: r.id,
    date: r.date,
    teamId: r.team_id,
    startTime,
    durationHours: r.duration_hours,
    customerName: r.customer_name,
    statusId: r.status_id,
    notes: r.notes,
    address: r.address,
    clientPhone: r.client_phone,
    clientEmail: r.client_email,
    orderNumbers: r.order_numbers,
    productsArrived: r.products_arrived ?? false,
    salesperson_id: r.salesperson_id ?? null
  }
}

export async function getBookingsForDay (isoDate) {
  const res = await supabase.from('bookings').select('*').eq('date', isoDate)
  return unwrap(res).map(rowToBooking)
}

// Unscoped by date — used for job search, which needs to find a booking
// regardless of which week is currently on screen.
export async function getAllBookings () {
  const res = await supabase.from('bookings').select('*').order('date', { ascending: true })
  return unwrap(res).map(rowToBooking)
}

// Supports both call styles:
// - getBookingsForWeek(weekStartDate)
// - getBookingsForWeek('YYYY-MM-DD', 'YYYY-MM-DD')
export async function getBookingsForWeek (start, end) {
  let startIsoDate
  let endIsoDate

  if (start instanceof Date) {
    const s = new Date(start)
    const e = new Date(start)
    e.setDate(e.getDate() + 6)
    startIsoDate = toLocalISO(s)
    endIsoDate = toLocalISO(e)
  } else {
    startIsoDate = start
    endIsoDate = end
  }

  const res = await supabase
    .from('bookings')
    .select('*')
    .gte('date', startIsoDate)
    .lte('date', endIsoDate)

  return unwrap(res).map(rowToBooking)
}

export async function createBooking (payload) {
  const row = bookingToRow(payload)
  delete row.id
  const res = await supabase.from('bookings').insert([row]).select('*').single()
  return rowToBooking(unwrap(res))
}

// Supports both call styles:
// - updateBooking(fullBookingObject)
// - updateBooking(id, patch)
export async function updateBooking (idOrPayload, patch) {
  const { id, data } = splitId(idOrPayload, patch)
  if (!id) throw new Error('updateBooking requires an id')
  const row = bookingToRow({ id, ...data })
  delete row.id
  const res = await supabase.from('bookings').update(row).eq('id', id).select('*').single()
  return rowToBooking(unwrap(res))
}

export async function deleteBooking (id) {
  const res = await supabase.from('bookings').delete().eq('id', id)
  return unwrap(res)
}

// -------------------- people --------------------

export async function getPeople () {
  const res = await supabase.from('people').select('*').order('name')
  return unwrap(res)
}

export async function createPerson (payload) {
  const res = await supabase.from('people').insert([payload]).select('*').single()
  return unwrap(res)
}

export async function updatePerson (idOrPayload, patch) {
  const { id, data } = splitId(idOrPayload, patch)
  if (!id) throw new Error('updatePerson requires an id')
  const res = await supabase.from('people').update(data).eq('id', id).select('*').single()
  return unwrap(res)
}

export async function deletePerson (id) {
  const res = await supabase.from('people').delete().eq('id', id)
  return unwrap(res)
}
