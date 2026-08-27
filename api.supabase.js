// api.supabase.js
//
// Thin data-access layer over Supabase. Every function here maps between
// the DB's snake_case columns and the camelCase shape the UI components use.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

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

// -------------------- teams --------------------

function teamToRow (t) {
  return {
    id: t.id,
    name: t.name,
    team_lead_id: t.teamLeadId || null,
    member_ids: Array.isArray(t.memberIds) ? t.memberIds : []
  }
}

function rowToTeam (r) {
  return {
    id: r.id,
    name: r.name,
    teamLeadId: r.team_lead_id,
    memberIds: r.member_ids || []
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

// -------------------- bookings --------------------

function bookingToRow (b) {
  return {
    id: b.id,
    date: b.date,
    team_id: b.teamId,
    start_time: b.startTime,
    duration_hours: b.durationHours,
    customer_name: b.customerName,
    job_type: b.jobType,
    notes: b.notes,
    address: b.address,
    client_phone: b.clientPhone,
    client_email: b.clientEmail,
    order_numbers: b.orderNumbers,
    crew: b.crew ?? [],
    products: b.products ?? [],
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
    jobType: r.job_type,
    notes: r.notes,
    address: r.address,
    clientPhone: r.client_phone,
    clientEmail: r.client_email,
    orderNumbers: r.order_numbers,
    crew: r.crew ?? [],
    products: r.products ?? [],
    salesperson_id: r.salesperson_id ?? null
  }
}

export async function getBookingsForDay (isoDate) {
  const res = await supabase.from('bookings').select('*').eq('date', isoDate)
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

// -------------------- products --------------------

export async function getProducts () {
  const res = await supabase.from('products').select('*').order('name')
  return unwrap(res)
}

export async function createProduct (payload) {
  const res = await supabase.from('products').insert([payload]).select('*').single()
  return unwrap(res)
}

export async function updateProduct (idOrPayload, patch) {
  const { id, data } = splitId(idOrPayload, patch)
  if (!id) throw new Error('updateProduct requires an id')
  const res = await supabase.from('products').update(data).eq('id', id).select('*').single()
  return unwrap(res)
}

export async function deleteProduct (id) {
  const res = await supabase.from('products').delete().eq('id', id)
  return unwrap(res)
}
