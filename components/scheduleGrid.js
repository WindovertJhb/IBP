// components/scheduleGrid.js
import * as api from '../api.supabase.js'
import { getMonday, addDays, formatDateISO, formatDateShort } from './dateUtils.js'
import { escapeHtml } from './dom.js'
import { isEditor } from './role.js'

const START_HOUR = 8
const END_HOUR = 18
const SLOT_MINUTES = 30
const TIME_SLOTS = buildTimeSlots() // ["08:00","08:30",...]

let teams = []
let bookings = []
let people = []
let statuses = []

let viewMode = 'day'
let currentDate = new Date()

// job search (filters jobs by customer name, order number or phone, and
// sorts results by closest date to today). It has to search across every
// booking, not just the currently displayed week, so it keeps its own
// unscoped copy of the data separate from `bookings` above.
let jobSearchQuery = ''
let pendingOpenBookingId = null
let searchPoolPromise = null

let scheduleGridContainer
let labelEl
let dayPickerEl
let bookingModal
let bookingForm
let resizeState = null

// drag state (mouse-based, no HTML5 DnD)
let dragState = null
const DRAG_THRESHOLD = 4 // pixels before we treat as a drag

let shouldScrollToToday = false

export function initScheduleGrid () {
  scheduleGridContainer = document.getElementById('scheduleGridContainer')
  labelEl = document.getElementById('scheduleLabel')
  dayPickerEl = document.getElementById('dayDatePicker')

  bookingModal = new bootstrap.Modal(document.getElementById('bookingModal'))
  bookingForm = document.getElementById('booking-form')

  setupToolbar()
  setupModalHandlers()
  setupJobSearch()

  window.addEventListener('teamsUpdated', refreshData)
  window.addEventListener('bookingsUpdated', refreshData)
  window.addEventListener('peopleUpdated', refreshData)
  window.addEventListener('statusesUpdated', refreshData)
  window.addEventListener('bookingsUpdated', () => { searchPoolPromise = null })

  // global mouse listeners for drag
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)

  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)

  refreshData()
}

/* ---------------- data & label ---------------- */

async function refreshData () {
  try {
    teams = await api.getTeams()
    people = await api.getPeople()
    statuses = await api.getStatuses()

    const weekStart = getMonday(currentDate)
    bookings = await api.getBookingsForWeek(weekStart)

    populateModalOptions()
    renderLabel()
    renderLegend()
    renderGrid()
    renderSearchResults()

    // If user clicked a search result, open that booking after the grid refresh
    if (pendingOpenBookingId) {
      const b = bookings.find(x => String(x.id) === String(pendingOpenBookingId))
      pendingOpenBookingId = null
      if (b) openModalForEdit(b)
    }
  } catch (err) {
    console.error('refreshData failed', err)
  }
}

function renderLabel () {
  if (viewMode === 'day') {
    labelEl.textContent = currentDate.toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  } else {
    const weekStart = getMonday(currentDate)
    const weekEnd = addDays(weekStart, 4)
    labelEl.textContent = `Week of ${formatDateShort(weekStart)} – ${formatDateShort(weekEnd)}`
  }
  if (dayPickerEl) {
    if (viewMode === 'day') {
      dayPickerEl.disabled = false
      dayPickerEl.value = formatDateISO(currentDate)
    } else {
      dayPickerEl.disabled = true
    }
  }
}

function renderLegend () {
  const legendEl = document.getElementById('scheduleLegend')
  if (!legendEl) return

  if (!statuses.length) {
    legendEl.innerHTML = ''
    return
  }

  legendEl.innerHTML = statuses
    .map(s => `
      <span>
        <span class="legend-color" style="background-color: ${escapeHtml(s.color)};"></span>${escapeHtml(s.name)}
      </span>
    `)
    .join('')
}

/* ---------------- job search ---------------- */

function setupJobSearch () {
  const input = document.getElementById('jobSearchInput')
  const clearBtn = document.getElementById('jobSearchClear')
  if (!input) return

  let t = null
  const apply = () => {
    jobSearchQuery = (input.value || '').trim()
    renderGrid() // filter the visible week/day immediately (no DB fetch)
    renderSearchResults() // search across all bookings for the results list
  }

  input.addEventListener('input', () => {
    if (t) window.clearTimeout(t)
    t = window.setTimeout(apply, 120)
  })

  if (clearBtn) {
    clearBtn.addEventListener('click', e => {
      e.preventDefault()
      input.value = ''
      jobSearchQuery = ''
      renderGrid()
      renderSearchResults()
      input.focus()
    })
  }
}

function matchesJobSearch (booking) {
  if (!jobSearchQuery) return true

  const q = jobSearchQuery.toLowerCase()
  const name = String(booking?.customerName || '').toLowerCase()
  const orderNumbers = String(booking?.orderNumbers || '').toLowerCase()
  if (name.includes(q) || orderNumbers.includes(q)) return true

  // Phone numbers get typed with all sorts of spacing/dashes, so compare
  // digits-only rather than requiring an exact-format substring match.
  const qDigits = jobSearchQuery.replace(/\D/g, '')
  if (qDigits) {
    const phoneDigits = String(booking?.clientPhone || '').replace(/\D/g, '')
    if (phoneDigits.includes(qDigits)) return true
  }

  return false
}

function isoToDateMs (iso) {
  // treat YYYY-MM-DD as local midnight
  if (!iso) return 0
  const d = new Date(String(iso) + 'T00:00:00')
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function bookingDistanceFromToday (booking) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const ms = isoToDateMs(booking?.date)
  return Math.abs(ms - today.getTime())
}

function loadSearchPool () {
  if (!searchPoolPromise) {
    searchPoolPromise = api.getAllBookings().catch(err => {
      console.error('Failed to load bookings for search', err)
      searchPoolPromise = null
      return []
    })
  }
  return searchPoolPromise
}

async function renderSearchResults () {
  const container = document.getElementById('jobSearchResults')
  if (!container) return

  if (!jobSearchQuery) {
    container.innerHTML = ''
    return
  }

  const pool = await loadSearchPool()

  // The query may have changed (or been cleared) while the fetch was in
  // flight — don't clobber a newer render with a stale one.
  if (!jobSearchQuery) return

  const results = (pool || [])
    .filter(b => matchesJobSearch(b))
    .sort((a, b) => {
      const da = bookingDistanceFromToday(a)
      const db = bookingDistanceFromToday(b)
      if (da !== db) return da - db

      const aMs = isoToDateMs(a.date)
      const bMs = isoToDateMs(b.date)
      if (aMs !== bMs) return aMs - bMs

      return String(a.startTime || '').localeCompare(String(b.startTime || ''))
    })
    .slice(0, 30)

  if (!results.length) {
    container.innerHTML = '<div class="text-muted small">No matching jobs.</div>'
    return
  }

  container.innerHTML = `
    <div class="list-group list-group-flush">
      ${results
        .map(b => {
          const dateLabel = b.date || ''
          const timeLabel = b.startTime || ''
          const teamName = (teams || []).find(t => String(t.id) === String(b.teamId))?.name || ''
          const cust = (b.customerName || 'Job').trim() || 'Job'
          const sub = [teamName, timeLabel].filter(Boolean).join(' • ')
          return `
            <button
              type="button"
              class="list-group-item list-group-item-action py-2"
              data-action="jump-to-job"
              data-booking-id="${escapeHtml(String(b.id))}"
              title="Jump to this job"
            >
              <div class="d-flex justify-content-between">
                <div class="fw-semibold">${escapeHtml(cust)}</div>
                <div class="text-muted small">${escapeHtml(dateLabel)}</div>
              </div>
              <div class="text-muted small">${escapeHtml(sub)}</div>
            </button>
          `
        })
        .join('')}
    </div>
  `

  container.onclick = e => {
    const btn = e.target.closest('[data-action="jump-to-job"]')
    if (!btn) return
    const id = btn.dataset.bookingId
    // Look the booking up from the search pool, not the currently displayed
    // week's `bookings` — the whole point of search is finding jobs outside
    // the visible week, so it won't be in `bookings` yet.
    const booking = results.find(x => String(x.id) === String(id))
    if (!booking) return

    // jump to the day that contains this booking, refresh data for that period
    pendingOpenBookingId = booking.id
    currentDate = new Date(String(booking.date) + 'T00:00:00')

    viewMode = 'day'
    document.getElementById('btnViewDay')?.classList.add('active')
    document.getElementById('btnViewWeek')?.classList.remove('active')

    refreshData()
  }
}

/* ---------------- grid rendering ---------------- */

function scrollToCurrentDayInWeek () {
  if (!scheduleGridContainer) return

  const currentIso = formatDateISO(currentDate)
  const table = scheduleGridContainer.querySelector(`table.schedule-grid[data-day="${currentIso}"]`)
  if (!table) return

  const daySection = table.closest('.day-section') || table
  daySection.scrollIntoView({ behavior: 'auto', block: 'start' })
}

function renderGrid () {
  if (!scheduleGridContainer) return
  scheduleGridContainer.innerHTML = ''

  const days = []
  if (viewMode === 'day') {
    const d = new Date(currentDate)
    days.push({
      date: d,
      iso: formatDateISO(d),
      label: d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
    })
  } else {
    const weekStart = getMonday(currentDate)
    for (let i = 0; i < 6; i++) {
      const d = addDays(weekStart, i)
      days.push({
        date: d,
        iso: formatDateISO(d),
        label: d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
      })
    }
  }

  let html = ''

  days.forEach(day => {
    const bookingsForDay = bookings.filter(b => b.date === day.iso).filter(matchesJobSearch)

    // grid[teamId][timeIdx] => null | {type:'booking'|'skip', booking, rowSpan}
    const grid = {}
    teams.forEach(t => {
      grid[t.id] = Array(TIME_SLOTS.length).fill(null)
    })

    bookingsForDay.forEach(b => {
      const teamId = b.teamId
      if (!grid[teamId]) return
      const startIndex = TIME_SLOTS.indexOf(b.startTime)
      if (startIndex === -1) return
      const span = Math.max(1, Math.round((toNumber(b.durationHours) || 0.5) * 2))
      const endIndex = Math.min(TIME_SLOTS.length, startIndex + span)

      grid[teamId][startIndex] = { type: 'booking', booking: b, rowSpan: endIndex - startIndex }
      for (let i = startIndex + 1; i < endIndex; i++) {
        grid[teamId][i] = { type: 'skip' }
      }
    })

    html += `
      <div class="day-section mb-3">
        <div class="day-header">${escapeHtml(day.label)}</div>
        <div class="table-responsive">
          <table class="schedule-grid" data-day="${day.iso}">
            <thead>
              <tr>
                <th class="time-col">Time</th>
                ${teams
                  .map(t => `<th class="text-center mechanic-col" data-team-id="${t.id}">${escapeHtml(t.name)}</th>`)
                  .join('')}
              </tr>
            </thead>
            <tbody>
    `

    TIME_SLOTS.forEach(slotTime => {
      html += `
        <tr>
          <td class="time-cell">${slotTime}</td>
      `
      teams.forEach(team => {
        const cell = grid[team.id][TIME_SLOTS.indexOf(slotTime)]
        if (!cell) {
          html += `
            <td
              class="schedule-slot"
              data-date="${day.iso}"
              data-team-id="${team.id}"
              data-time="${slotTime}"
            ></td>
          `
        } else if (cell.type === 'booking') {
          const b = cell.booking
          const status = statuses.find(s => String(s.id) === String(b.statusId))
          const bgColor = status ? status.color : '#6c757d' // fallback for bookings with no status set
          const textColor = contrastTextColor(bgColor)

          const customerBits = [
            b.customerName && b.customerName.trim(),
            b.clientPhone && b.clientPhone.trim(),
            b.address && b.address.split('\n')[0].trim()
          ].filter(Boolean)

          const customerLabel = customerBits.length ? customerBits.join(' | ') : 'Booking'
          const metaLine = buildBookingMetaLine(b)
          const notesLines = buildBookingNotesLines(b)

          html += `
            <td
                class="schedule-slot"
                data-date="${day.iso}"
                data-team-id="${team.id}"
                data-time="${slotTime}"
                rowspan="${cell.rowSpan}"
            >
                <div class="booking-block${isEditor() ? '' : ' booking-block-readonly'}" data-booking-id="${b.id}" style="background-color: ${escapeHtml(bgColor)}; color: ${textColor};">
                ${b.productsArrived ? '<div class="booking-arrived-badge" title="Products arrived in store">📦</div>' : ''}
                <div class="booking-line-time">${slotTime}</div>
                <div class="booking-line-customer">${escapeHtml(customerLabel)}</div>
                ${metaLine ? `<div class="booking-line-meta">${escapeHtml(metaLine)}</div>` : ''}
                ${notesLines.map(line => `<div class="booking-line-meta">${escapeHtml(line)}</div>`).join('')}
                ${isEditor() ? '<div class="booking-resize-handle"></div>' : ''}
                </div>
            </td>
            `
        }
      })
      html += '</tr>'
    })

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `
  })

  scheduleGridContainer.innerHTML = html
  scheduleGridContainer.classList.toggle('viewer-mode', !isEditor())
  attachGridHandlers()

  if (viewMode === 'week' && shouldScrollToToday) {
    shouldScrollToToday = false
    scrollToCurrentDayInWeek()
  }
}

// Simple luminance heuristic: light backgrounds get black text, dark
// backgrounds get white text — good enough to stay readable across
// whatever colours get picked on the Status tab.
function contrastTextColor (hex) {
  const c = String(hex || '').replace('#', '')
  if (c.length !== 6) return '#000'
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#000' : '#fff'
}

function onResizeMove (e) {
  if (!resizeState) return

  e.preventDefault()

  const { startY, originalSpan, slotHeight, booking, ghost, blockTop } = resizeState
  const dy = e.clientY - startY

  const deltaSlots = Math.round(dy / slotHeight)
  let newSpan = originalSpan + deltaSlots
  if (newSpan < 1) newSpan = 1

  const startIndex = TIME_SLOTS.indexOf(booking.startTime)
  if (startIndex === -1) return

  if (startIndex + newSpan > TIME_SLOTS.length) {
    newSpan = TIME_SLOTS.length - startIndex
  }

  resizeState.newSpan = newSpan

  if (ghost) {
    const newHeight = newSpan * slotHeight
    ghost.style.height = `${newHeight}px`
    ghost.style.top = `${blockTop}px` // keep top anchored
  }
}

async function onResizeEnd () {
  if (!resizeState) return

  const { booking, newSpan, originalSpan, ghost } = resizeState
  resizeState = null

  if (ghost) ghost.remove()

  document.querySelectorAll('.booking-block.resizing').forEach(b => b.classList.remove('resizing'))

  if (!newSpan || newSpan === originalSpan) return

  const newDurationHours = (newSpan * SLOT_MINUTES) / 60
  const updated = { ...booking, durationHours: newDurationHours }

  if (!fitsInDay(updated)) {
    alert('Outside working hours.')
    return
  }
  if (hasOverlap(updated, bookings)) {
    alert('New length would overlap another booking.')
    return
  }

  try {
    await api.updateBooking(updated)
    window.dispatchEvent(new CustomEvent('bookingsUpdated'))
  } catch (err) {
    console.error(err)
    alert('Unable to update booking duration.')
  }
}

/* ---------------- interactions (click + drag) ---------------- */

function attachGridHandlers () {
  if (!scheduleGridContainer) return

  scheduleGridContainer.onclick = e => {
    if (e.target.closest('.booking-resize-handle')) return

    const block = e.target.closest('.booking-block')
    if (block && !dragState) {
      const booking = findBookingByBlock(block)
      if (booking) openModalForEdit(booking)
      return
    }

    const slot = e.target.closest('.schedule-slot')
    if (slot && !dragState && isEditor()) {
      const { date, teamId, time } = slot.dataset
      openModalForNew(date, teamId, time)
    }
  }

  if (isEditor()) {
    const blocks = scheduleGridContainer.querySelectorAll('.booking-block')
    blocks.forEach(block => {
      block.addEventListener('mousedown', onBlockMouseDown)
    })
  }

  const handles = scheduleGridContainer.querySelectorAll('.booking-resize-handle')
  handles.forEach(handle => {
    handle.onclick = async e => {
      e.stopPropagation()
      e.preventDefault()

      const block = handle.closest('.booking-block')
      if (!block) return

      const booking = findBookingByBlock(block)
      if (!booking) return

      const direction = e.shiftKey ? -1 : 1
      await handleResizeClick(booking, direction)
    }

    handle.onmousedown = e => {
      e.stopPropagation()
      e.preventDefault()

      const block = handle.closest('.booking-block')
      if (!block) return

      const booking = findBookingByBlock(block)
      if (!booking) return

      const td = block.closest('td')
      const rowSpan = Number(td.getAttribute('rowspan') || 1)
      const rect = td.getBoundingClientRect()
      const slotHeight = rect.height / rowSpan

      const scrollX = window.scrollX || window.pageXOffset
      const scrollY = window.scrollY || window.pageYOffset
      const docLeft = rect.left + scrollX
      const docTop = rect.top + scrollY

      const ghost = block.cloneNode(true)
      ghost.classList.add('booking-resize-ghost')
      ghost.style.position = 'absolute'
      ghost.style.left = `${docLeft}px`
      ghost.style.top = `${docTop}px`
      ghost.style.width = `${rect.width}px`
      ghost.style.height = `${rect.height}px`
      ghost.style.pointerEvents = 'none'

      document.body.appendChild(ghost)
      block.classList.add('resizing')

      resizeState = {
        booking,
        startY: e.clientY,
        originalSpan: rowSpan,
        slotHeight,
        newSpan: rowSpan,
        ghost,
        blockTop: docTop
      }
    }
  })
}

function onBlockMouseDown (e) {
  if (e.target.closest('.booking-resize-handle')) return

  const block = e.currentTarget
  const booking = findBookingByBlock(block)
  if (!booking) return

  e.preventDefault()

  const rect = block.getBoundingClientRect()

  dragState = {
    booking,
    block,
    startX: e.clientX,
    startY: e.clientY,
    ghost: null,
    didDrag: false,
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top
  }
}

/* ---- document-level drag move / end ---- */

function onDragMove (e) {
  if (!dragState) return

  const dx = e.clientX - dragState.startX
  const dy = e.clientY - dragState.startY

  if (!dragState.didDrag) {
    if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
      return
    }
    dragState.didDrag = true
    dragState.block.classList.add('dragging')

    const rect = dragState.block.getBoundingClientRect()
    const ghost = dragState.block.cloneNode(true)
    ghost.classList.add('booking-drag-ghost')
    ghost.style.width = `${rect.width}px`
    ghost.style.height = `${rect.height}px`
    document.body.appendChild(ghost)
    dragState.ghost = ghost
  }

  if (dragState.ghost) {
    dragState.ghost.style.left = `${e.clientX - dragState.offsetX}px`
    dragState.ghost.style.top = `${e.clientY - dragState.offsetY}px`
  }

  highlightDropTargets(e.clientX, e.clientY)
}

async function onDragEnd (e) {
  if (!dragState) return

  const state = dragState
  dragState = null

  clearDropTargets()
  state.block.classList.remove('dragging')
  if (state.ghost) state.ghost.remove()

  if (!state.didDrag) {
    // treat as normal click; container onclick handles edit
    return
  }

  const target = document.elementFromPoint(e.clientX, e.clientY)
  if (!target) return
  const slot = target.closest('.schedule-slot')
  if (!slot) return

  const updated = {
    ...state.booking,
    date: slot.dataset.date,
    teamId: slot.dataset.teamId,
    startTime: slot.dataset.time
  }

  if (!fitsInDay(updated)) {
    alert('Outside working hours.')
    return
  }
  if (hasOverlap(updated, bookings)) {
    alert('Overlaps with another booking for that team.')
    return
  }

  try {
    await api.updateBooking(updated)
    window.dispatchEvent(new CustomEvent('bookingsUpdated'))
  } catch (err) {
    console.error(err)
    alert('Could not move booking.')
  }
}

/* ---- drop target highlighting ---- */

function highlightDropTargets (x, y) {
  clearDropTargets()
  const el = document.elementFromPoint(x, y)
  if (!el) return
  const slot = el.closest('.schedule-slot')
  if (!slot) return

  const targetSlot = scheduleGridContainer.querySelector(
    `.schedule-slot[data-date="${slot.dataset.date}"][data-team-id="${slot.dataset.teamId}"][data-time="${slot.dataset.time}"]`
  )
  if (targetSlot) targetSlot.classList.add('drop-target')
}

function clearDropTargets () {
  if (!scheduleGridContainer) return
  scheduleGridContainer.querySelectorAll('.schedule-slot.drop-target').forEach(el => el.classList.remove('drop-target'))
}

/* ---------------- resize by click (handle) ---------------- */

async function handleResizeClick (booking, direction) {
  const deltaHours = 0.5 * direction
  const current = toNumber(booking.durationHours) || 0.5
  const next = Math.max(0.5, current + deltaHours)

  const updated = { ...booking, durationHours: next }

  if (!fitsInDay(updated)) return // would run past closing time — ignore
  if (hasOverlap(updated, bookings)) {
    alert('New length would overlap another booking.')
    return
  }

  try {
    await api.updateBooking(updated)
    window.dispatchEvent(new CustomEvent('bookingsUpdated'))
  } catch (err) {
    console.error(err)
    alert('Unable to change duration.')
  }
}

/* ---------------- toolbar / nav ---------------- */

function setupToolbar () {
  document.getElementById('btnViewDay').addEventListener('click', () => {
    viewMode = 'day'
    document.getElementById('btnViewDay').classList.add('active')
    document.getElementById('btnViewWeek').classList.remove('active')
    refreshData()
  })

  document.getElementById('btnViewWeek').addEventListener('click', () => {
    viewMode = 'week'
    document.getElementById('btnViewWeek').classList.add('active')
    document.getElementById('btnViewDay').classList.remove('active')
    shouldScrollToToday = true
    refreshData()
  })

  document.getElementById('btnPrevPeriod').addEventListener('click', () => {
    currentDate = addDays(currentDate, viewMode === 'day' ? -1 : -7)
    refreshData()
  })

  document.getElementById('btnNextPeriod').addEventListener('click', () => {
    currentDate = addDays(currentDate, viewMode === 'day' ? 1 : 7)
    refreshData()
  })

  document.getElementById('btnTodayPeriod').addEventListener('click', () => {
    currentDate = new Date()
    if (viewMode === 'week') shouldScrollToToday = true
    refreshData()
  })

  if (dayPickerEl) {
    dayPickerEl.addEventListener('change', () => {
      const v = (dayPickerEl.value || '').trim()
      if (!v) return

      if (viewMode !== 'day') {
        viewMode = 'day'
        document.getElementById('btnViewDay')?.classList.add('active')
        document.getElementById('btnViewWeek')?.classList.remove('active')
      }

      currentDate = new Date(`${v}T00:00:00`)
      refreshData()
    })
  }

  const printBtn = document.getElementById('btnPrintDay')
  if (printBtn) printBtn.addEventListener('click', handlePrintDay)
}

function handlePrintDay () {
  const printArea = document.getElementById('printArea')
  if (!printArea) return

  const dayISO = formatDateISO(currentDate)
  const dayLabel = currentDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })

  const dayBookings = bookings.filter(b => b.date === dayISO).sort((a, b) => (a.startTime > b.startTime ? 1 : -1))

  let html = `
    <div class="print-day-header">
      <h1>Job cards for ${escapeHtml(dayLabel)}</h1>
      <div class="small">Generated ${escapeHtml(new Date().toLocaleString())}</div>
    </div>
  `

  if (!dayBookings.length) {
    html += '<p>No bookings for this day.</p>'
  } else {
    teams.forEach(team => {
      const teamBookings = dayBookings.filter(b => b.teamId === team.id)
      if (!teamBookings.length) return

      html += `
        <div class="print-team-page">
          <div class="print-team-header">
            <h2>${escapeHtml(team.name)} – ${escapeHtml(dayLabel)}</h2>
          </div>
      `

      teamBookings.forEach((b, idx) => {
        const bookingStatus = statuses.find(s => String(s.id) === String(b.statusId))
        const jobLabel = bookingStatus ? bookingStatus.name : 'Job'

        const salespersonId = b.salesperson_id
        const salespersonName = salespersonId ? (people.find(p => String(p.id) === String(salespersonId)) || {}).name : ''
        const salespersonLabel = salespersonName || (salespersonId ? String(salespersonId) : '')

        html += `
          <div class="print-jobcard">
            <div class="print-jobcard-header">
              <span>${escapeHtml(jobLabel)} #${idx + 1}</span>
              <span>${escapeHtml(b.startTime || '')} (${escapeHtml(String(b.durationHours ?? ''))} h)</span>
            </div>
            <div class="print-jobcard-row">
              <div class="print-jobcard-label">Customer</div>
              <div class="print-jobcard-value">${escapeHtml(b.customerName || '')}</div>
            </div>
            <div class="print-jobcard-row">
              <div class="print-jobcard-label">Sales</div>
              <div class="print-jobcard-value">${escapeHtml(salespersonLabel || '')}</div>
            </div>
            <div class="print-jobcard-row">
              <div class="print-jobcard-label">Phone</div>
              <div class="print-jobcard-value">${escapeHtml(b.clientPhone || '')}</div>
            </div>
            <div class="print-jobcard-row">
              <div class="print-jobcard-label">Order #</div>
              <div class="print-jobcard-value">${escapeHtml(b.orderNumbers || '')}</div>
            </div>
            <div class="print-jobcard-row">
              <div class="print-jobcard-label">Address</div>
              <div class="print-jobcard-value">${escapeHtml((b.address || '').replace(/\n/g, ', '))}</div>
            </div>
            <div class="print-jobcard-row">
              <div class="print-jobcard-label">Products / Notes</div>
              <div class="print-jobcard-value">${escapeHtml(b.notes || '')}</div>
            </div>
          </div>
        `
      })

      html += '</div>' // end .print-team-page
    })
  }

  printArea.innerHTML = html

  // Browser print dialog; choose "Save as PDF" for a file
  window.print()
}

/* ---------------- modal wiring ---------------- */

function populateModalOptions () {
  const startSelect = document.getElementById('booking-start')
  if (startSelect) {
    const prev = startSelect.value
    startSelect.innerHTML = ''
    TIME_SLOTS.forEach(t => {
      const opt = document.createElement('option')
      opt.value = t
      opt.textContent = t
      startSelect.appendChild(opt)
    })
    if (prev && TIME_SLOTS.includes(prev)) startSelect.value = prev
  }

  // Salesperson (separate from crew; can overlap across teams)
  const salespersonSelect = document.getElementById('booking-salesperson')
  if (salespersonSelect) {
    const prev = salespersonSelect.value
    salespersonSelect.innerHTML = ''

    const salesPeople = (people || []).filter(p => String(p.role || '').toLowerCase() === 'sales')

    const placeholderOpt = document.createElement('option')
    placeholderOpt.value = ''
    placeholderOpt.textContent = 'Select salesperson…'
    placeholderOpt.disabled = true
    salespersonSelect.appendChild(placeholderOpt)

    salesPeople.forEach(p => {
      const opt = document.createElement('option')
      opt.value = p.id
      opt.textContent = p.name
      salespersonSelect.appendChild(opt)
    })

    if (prev && salesPeople.some(p => String(p.id) === String(prev))) {
      salespersonSelect.value = prev
    } else {
      salespersonSelect.value = ''
    }
  }

  // Status (booking lifecycle stage — managed on the Status tab)
  const statusSelect = document.getElementById('booking-status')
  if (statusSelect) {
    const prev = statusSelect.value
    statusSelect.innerHTML = ''

    if (!statuses.length) {
      const emptyOpt = document.createElement('option')
      emptyOpt.value = ''
      emptyOpt.textContent = 'Add a status on the Status tab first'
      emptyOpt.disabled = true
      statusSelect.appendChild(emptyOpt)
    } else {
      statuses.forEach(s => {
        const opt = document.createElement('option')
        opt.value = s.id
        opt.textContent = s.name
        statusSelect.appendChild(opt)
      })
    }

    if (prev && statuses.some(s => String(s.id) === String(prev))) {
      statusSelect.value = prev
    }
  }
}

function setupModalHandlers () {
  if (!bookingForm) return

  const modalEl = document.getElementById('bookingModal')
  if (modalEl) modalEl.addEventListener('shown.bs.modal', updateBookingContactLinks)

  for (const id of ['booking-customer', 'booking-phone', 'booking-email', 'booking-date', 'booking-orderNumbers', 'booking-notes', 'booking-address']) {
    const el = document.getElementById(id)
    if (!el) continue
    el.addEventListener('input', updateBookingContactLinks)
    el.addEventListener('change', updateBookingContactLinks)
  }

  bookingForm.addEventListener('submit', async evt => {
    evt.preventDefault()

    const idInput = document.getElementById('booking-id')
    const dateInput = document.getElementById('booking-date')
    const teamSelect = document.getElementById('booking-team')
    const startSelect = document.getElementById('booking-start')
    const durationInput = document.getElementById('booking-duration')
    const customerInput = document.getElementById('booking-customer')
    const notesInput = document.getElementById('booking-notes')
    const statusSelect = document.getElementById('booking-status')
    const addressInput = document.getElementById('booking-address')
    const phoneInput = document.getElementById('booking-phone')
    const emailInput = document.getElementById('booking-email')
    const orderInput = document.getElementById('booking-orderNumbers')
    const salespersonSelect = document.getElementById('booking-salesperson')
    const productsArrivedInput = document.getElementById('booking-products-arrived')
    const errorEl = document.getElementById('booking-error')

    const rawDuration = durationInput.value.replace(',', '.')
    const durationHours = toNumber(rawDuration) || 1.5

    const payload = {
      id: idInput.value || null,
      date: dateInput.value,
      teamId: teamSelect.value,
      startTime: startSelect.value,
      durationHours,
      customerName: customerInput.value.trim(),
      notes: notesInput.value.trim(),
      statusId: statusSelect ? (statusSelect.value || null) : null,
      address: addressInput ? addressInput.value.trim() : '',
      clientPhone: phoneInput ? phoneInput.value.trim() : '',
      clientEmail: emailInput ? emailInput.value.trim() : '',
      orderNumbers: orderInput ? orderInput.value.trim() : '',
      salesperson_id: salespersonSelect ? (salespersonSelect.value || null) : null,
      productsArrived: productsArrivedInput ? productsArrivedInput.checked : false
    }

    if (!payload.salesperson_id) {
      if (errorEl) {
        errorEl.textContent = 'Please select a salesperson.'
        errorEl.classList.remove('d-none')
      }
      return
    }

    if (!fitsInDay(payload)) {
      if (errorEl) {
        errorEl.textContent = 'That start time and duration run past the end of the working day.'
        errorEl.classList.remove('d-none')
      }
      return
    }
    if (hasOverlap(payload, bookings)) {
      if (errorEl) {
        errorEl.textContent = 'This team already has a booking that overlaps that time.'
        errorEl.classList.remove('d-none')
      }
      return
    }

    try {
      if (payload.id) {
        await api.updateBooking(payload)
      } else {
        await api.createBooking(payload)
      }
      if (errorEl) errorEl.classList.add('d-none')
      bookingModal.hide()
      window.dispatchEvent(new CustomEvent('bookingsUpdated'))
    } catch (err) {
      console.error(err)
      if (errorEl) {
        errorEl.textContent = err.message || 'Unable to save booking.'
        errorEl.classList.remove('d-none')
      } else {
        alert('Unable to save booking.')
      }
    }
  })

  const deleteBtn = document.getElementById('btn-delete-booking')
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const idInput = document.getElementById('booking-id')
      const id = idInput.value
      if (!id) return
      if (!confirm('Delete this booking?')) return
      try {
        await api.deleteBooking(id)
        bookingModal.hide()
        window.dispatchEvent(new CustomEvent('bookingsUpdated'))
      } catch (err) {
        console.error(err)
        alert('Unable to delete booking.')
      }
    })
  }
}

function updateTeamLabel (teamId) {
  const label = document.getElementById('booking-team-label')
  if (!label) return
  const team = teams.find(t => String(t.id) === String(teamId))
  label.textContent = team ? team.name : '—'
}

// Viewers can open a booking to see its details, but can't change anything
// — disable every field and hide the buttons that write. This is UI
// polish only; the real block is server-side RLS.
function setBookingModalReadOnly (readOnly) {
  if (!bookingForm) return

  bookingForm.querySelectorAll('input, select, textarea').forEach(el => {
    el.disabled = readOnly
  })

  const saveBtn = bookingForm.querySelector('button[type="submit"]')
  if (saveBtn) saveBtn.classList.toggle('d-none', readOnly)

  const deleteBtn = document.getElementById('btn-delete-booking')
  if (deleteBtn && readOnly) deleteBtn.classList.add('d-none')

  const readOnlyNote = document.getElementById('booking-readonly-note')
  if (readOnlyNote) readOnlyNote.classList.toggle('d-none', !readOnly)
}

function openModalForNew (dateISO, teamId, startTime) {
  const idInput = document.getElementById('booking-id')
  const dateInput = document.getElementById('booking-date')
  const teamSelect = document.getElementById('booking-team')
  const startSelect = document.getElementById('booking-start')
  const durationInput = document.getElementById('booking-duration')
  const customerInput = document.getElementById('booking-customer')
  const notesInput = document.getElementById('booking-notes')
  const deleteBtn = document.getElementById('btn-delete-booking')
  const errorEl = document.getElementById('booking-error')
  const statusSelect = document.getElementById('booking-status')
  const addressInput = document.getElementById('booking-address')
  const phoneInput = document.getElementById('booking-phone')
  const emailInput = document.getElementById('booking-email')
  const orderInput = document.getElementById('booking-orderNumbers')
  const salespersonSelect = document.getElementById('booking-salesperson')
  const productsArrivedInput = document.getElementById('booking-products-arrived')

  if (idInput) idInput.value = ''
  if (deleteBtn) deleteBtn.classList.add('d-none')
  if (errorEl) errorEl.classList.add('d-none')

  dateInput.value = dateISO
  teamSelect.value = teamId
  startSelect.value = startTime
  durationInput.value = '1.5'
  customerInput.value = ''
  notesInput.value = ''
  if (statusSelect) statusSelect.value = statuses[0]?.id || ''
  if (addressInput) addressInput.value = ''
  if (phoneInput) phoneInput.value = ''
  if (emailInput) emailInput.value = ''
  if (orderInput) orderInput.value = ''
  if (salespersonSelect) salespersonSelect.value = ''
  if (productsArrivedInput) productsArrivedInput.checked = false

  updateTeamLabel(teamId)
  setBookingModalReadOnly(!isEditor())

  document.getElementById('bookingModalLabel').textContent = 'New booking'
  updateBookingContactLinks()
  bookingModal.show()
}

function openModalForEdit (booking) {
  const idInput = document.getElementById('booking-id')
  const dateInput = document.getElementById('booking-date')
  const teamSelect = document.getElementById('booking-team')
  const startSelect = document.getElementById('booking-start')
  const durationInput = document.getElementById('booking-duration')
  const customerInput = document.getElementById('booking-customer')
  const notesInput = document.getElementById('booking-notes')
  const deleteBtn = document.getElementById('btn-delete-booking')
  const errorEl = document.getElementById('booking-error')
  const statusSelect = document.getElementById('booking-status')
  const addressInput = document.getElementById('booking-address')
  const phoneInput = document.getElementById('booking-phone')
  const emailInput = document.getElementById('booking-email')
  const orderInput = document.getElementById('booking-orderNumbers')
  const salespersonSelect = document.getElementById('booking-salesperson')
  const productsArrivedInput = document.getElementById('booking-products-arrived')

  if (idInput) idInput.value = booking.id
  if (deleteBtn) deleteBtn.classList.remove('d-none')
  if (errorEl) errorEl.classList.add('d-none')

  dateInput.value = booking.date
  teamSelect.value = booking.teamId
  startSelect.value = booking.startTime
  durationInput.value = String(toNumber(booking.durationHours) || 1.5)
  customerInput.value = booking.customerName || ''
  notesInput.value = booking.notes || ''
  if (statusSelect) statusSelect.value = booking.statusId != null ? String(booking.statusId) : ''
  if (addressInput) addressInput.value = booking.address || ''
  if (phoneInput) phoneInput.value = booking.clientPhone || ''
  if (emailInput) emailInput.value = booking.clientEmail || ''
  if (orderInput) orderInput.value = booking.orderNumbers || ''
  if (salespersonSelect) {
    const sp = booking.salesperson_id
    salespersonSelect.value = sp != null ? String(sp) : ''
  }
  if (productsArrivedInput) productsArrivedInput.checked = !!booking.productsArrived

  updateTeamLabel(booking.teamId)
  setBookingModalReadOnly(!isEditor())

  document.getElementById('bookingModalLabel').textContent = isEditor() ? 'Edit booking' : 'View booking'
  updateBookingContactLinks()
  bookingModal.show()
}

/* ---------------- contact actions (Email / WhatsApp) ---------------- */
//
// This is the v1 manual fallback: it opens wa.me / mailto with a prefilled
// message for the user to send by hand. Automated, tracked WhatsApp sends
// (booking confirmations, day-before reminders, inbound reply logging) are
// a separate Phase 2 project layered on top of this — see the WhatsApp
// automation spec. This button stays either way; it's free and useful.

function extractEmailFromText (...parts) {
  const text = parts.filter(Boolean).join(' ')
  const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return m ? m[0] : ''
}

function normalizeWhatsappNumber (raw) {
  if (!raw) return ''
  let digits = String(raw).replace(/\D/g, '')

  if (digits.startsWith('00')) digits = digits.slice(2)

  // SA-friendly: 0XXXXXXXXX -> 27XXXXXXXXX
  if (digits.startsWith('0') && digits.length === 10) digits = '27' + digits.slice(1)

  return digits
}

function setLinkEnabled (a, enabled, href) {
  if (!a) return
  if (enabled) {
    a.classList.remove('disabled')
    a.removeAttribute('aria-disabled')
    a.removeAttribute('tabindex')
    a.setAttribute('href', href || '#')
  } else {
    a.classList.add('disabled')
    a.setAttribute('aria-disabled', 'true')
    a.setAttribute('tabindex', '-1')
    a.setAttribute('href', '#')
  }
}

function updateBookingContactLinks () {
  const aWa = document.getElementById('booking-whatsapp-link')
  const aMail = document.getElementById('booking-email-link')
  const hint = document.getElementById('booking-contact-hint')

  const customer = document.getElementById('booking-customer')?.value?.trim() || ''
  const phoneRaw = document.getElementById('booking-phone')?.value?.trim() || ''
  const emailRaw = document.getElementById('booking-email')?.value?.trim() || ''
  const dateIso = document.getElementById('booking-date')?.value || ''
  const orderNumbers = document.getElementById('booking-orderNumbers')?.value?.trim() || ''
  const notes = document.getElementById('booking-notes')?.value?.trim() || ''
  const address = document.getElementById('booking-address')?.value?.trim() || ''

  const dateStr = dateIso ? formatDateShort(new Date(dateIso)) : 'your booking date'
  const subject = encodeURIComponent(`Booking: ${customer || 'Client'} (${dateStr})`)
  const body = encodeURIComponent(
    `Hi ${customer || ''}${customer ? ',' : ''}\n\n` +
    `Just following up on your booking scheduled for ${dateStr}.\n` +
    (orderNumbers ? `Order no(s): ${orderNumbers.replace(/\n+/g, ', ')}\n` : '') +
    (address ? `Address: ${address}\n` : '') +
    (notes ? `Notes: ${notes}\n` : '') +
    '\nThanks,\n'
  )

  const detectedEmail = extractEmailFromText(notes, address, orderNumbers)
  const email = emailRaw || detectedEmail
  const waNumber = normalizeWhatsappNumber(phoneRaw)

  if (waNumber) {
    const msg = encodeURIComponent(
      `Hi ${customer || ''}${customer ? ',' : ''}\n` +
      `Just following up on your booking scheduled for ${dateStr}.` +
      (orderNumbers ? `\nOrder no(s): ${orderNumbers.replace(/\n+/g, ', ')}` : '')
    )
    setLinkEnabled(aWa, true, `https://wa.me/${waNumber}?text=${msg}`)
  } else {
    setLinkEnabled(aWa, false)
  }

  if (email) {
    setLinkEnabled(aMail, true, `mailto:${email}?subject=${subject}&body=${body}`)
  } else {
    // no email on file — still let them open the composer and paste one in
    setLinkEnabled(aMail, true, `mailto:?subject=${subject}&body=${body}`)
  }

  if (hint) {
    const bits = []
    if (phoneRaw) bits.push(`WhatsApp: ${waNumber || 'invalid number'}`)
    if (email) bits.push(`Email: ${email}`)
    if (!phoneRaw && !email) bits.push('Tip: add a mobile number and/or client email to enable one-click contact.')
    hint.textContent = bits.join(' • ')
  }
}

/* ---------------- helpers ---------------- */

function buildBookingMetaLine (b) {
  const bits = []

  const status = statuses.find(s => String(s.id) === String(b.statusId))
  if (status) bits.push(status.name)

  const salesperson = b.salesperson_id
  if (salesperson != null && people && people.length) {
    const sp = people.find(p => String(p.id) === String(salesperson))
    if (sp && sp.name) bits.push(`Sales: ${sp.name}`)
  }

  return bits.join(' – ')
}

// Every non-blank line of Notes, shown as its own line on the block —
// falls back to the first line of order numbers only when there's no
// notes at all, matching the old single-line summary's behaviour.
function buildBookingNotesLines (b) {
  const notesLines = (b.notes || '').split('\n').map(l => l.trim()).filter(Boolean)
  if (notesLines.length) return notesLines

  const orderSummary = (b.orderNumbers || '').split('\n')[0].trim()
  return orderSummary ? [orderSummary] : []
}

function buildTimeSlots () {
  const slots = []
  for (let h = START_HOUR; h < END_HOUR; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`)
    slots.push(`${String(h).padStart(2, '0')}:30`)
  }
  return slots
}

function findBookingByBlock (block) {
  const id = block.dataset.bookingId
  return bookings.find(b => String(b.id) === String(id))
}

function hasOverlap (booking, all) {
  const { teamId, date, startTime, durationHours } = booking
  if (!teamId || !date || !startTime || !durationHours) return false

  const [sh, sm] = startTime.split(':').map(Number)
  const startMinutes = sh * 60 + sm
  const endMinutes = startMinutes + toNumber(durationHours) * 60

  return all.some(b => {
    if (b.id === booking.id) return false
    if (b.teamId !== teamId || b.date !== date) return false
    if (!b.startTime || !b.durationHours) return false

    const [bh, bm] = b.startTime.split(':').map(Number)
    const bStart = bh * 60 + bm
    const bEnd = bStart + toNumber(b.durationHours) * 60

    return startMinutes < bEnd && endMinutes > bStart
  })
}

function fitsInDay (booking) {
  const { startTime, durationHours } = booking
  if (!startTime || !durationHours) return false
  const startIndex = TIME_SLOTS.indexOf(startTime)
  if (startIndex === -1) return false
  const span = Math.round(toNumber(durationHours) * 2)
  const endIndex = startIndex + span
  return endIndex <= TIME_SLOTS.length
}

function toNumber (val) {
  if (typeof val === 'number') return val
  if (!val) return NaN
  return parseFloat(String(val).replace(',', '.'))
}
