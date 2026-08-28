// components/statuses.js
import * as api from '../api.supabase.js'
import { escapeHtml } from './dom.js'

let statuses = []

export function initStatuses () {
  setupHandlers()
  refreshStatuses()
}

async function refreshStatuses () {
  try {
    statuses = await api.getStatuses()
  } catch (err) {
    console.error('Failed to load statuses', err)
    statuses = []
  }
  renderStatusesTable()
}

/* ------------ DOM wiring ------------ */

function setupHandlers () {
  const form = document.getElementById('status-form')
  const resetBtn = document.getElementById('btn-status-reset')
  const table = document.getElementById('statuses-table')

  if (form) form.addEventListener('submit', onFormSubmit)
  if (resetBtn) {
    resetBtn.addEventListener('click', e => {
      e.preventDefault()
      clearForm()
    })
  }
  if (table) table.addEventListener('click', onTableClick)
}

/* ------------ Rendering ------------ */

function renderStatusesTable () {
  const tbody = document.querySelector('#statuses-table tbody')
  if (!tbody) return

  if (!statuses.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="2" class="text-muted small text-center py-3">
          No statuses yet. Add your first one on the left.
        </td>
      </tr>
    `
    return
  }

  tbody.innerHTML = statuses
    .map(s => {
      return `
        <tr data-status-id="${s.id}">
          <td>
            <span class="legend-color" style="background-color: ${escapeHtml(s.color)};"></span>
            ${escapeHtml(s.name)}
          </td>
          <td class="text-end">
            <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete-status">
              &#128465;
            </button>
          </td>
        </tr>
      `
    })
    .join('')
}

/* ------------ Form handlers ------------ */

async function onFormSubmit (e) {
  e.preventDefault()

  const idInput = document.getElementById('status-id')
  const nameInput = document.getElementById('status-name')
  const colorInput = document.getElementById('status-color')

  const id = idInput.value || null
  const name = nameInput.value.trim()
  const color = colorInput.value || '#0d6efd'

  if (!name) {
    nameInput.focus()
    return
  }

  const payload = { name, color }

  try {
    if (id) {
      await api.updateStatus({ id, ...payload })
    } else {
      await api.createStatus(payload)
    }
    window.dispatchEvent(new CustomEvent('statusesUpdated'))

    clearForm()
    await refreshStatuses()
  } catch (err) {
    console.error('Failed to save status', err)
    alert('Unable to save status.')
  }
}

function onTableClick (e) {
  const deleteBtn = e.target.closest('[data-action="delete-status"]')
  const row = e.target.closest('tr[data-status-id]')
  if (!row) return

  const id = row.dataset.statusId
  const status = statuses.find(s => String(s.id) === String(id))
  if (!status) return

  if (deleteBtn) {
    handleDeleteStatus(status)
  } else {
    fillForm(status)
  }
}

async function handleDeleteStatus (status) {
  if (!confirm(`Delete "${status.name}"? Bookings using it will show no status until you set a new one.`)) return
  try {
    await api.deleteStatus(status.id)
    await refreshStatuses()
    window.dispatchEvent(new CustomEvent('statusesUpdated'))
    const idInput = document.getElementById('status-id')
    if (idInput && idInput.value === String(status.id)) {
      clearForm()
    }
  } catch (err) {
    console.error('Failed to delete status', err)
    alert('Unable to delete status.')
  }
}

/* ------------ Form helpers ------------ */

function fillForm (status) {
  const idInput = document.getElementById('status-id')
  const nameInput = document.getElementById('status-name')
  const colorInput = document.getElementById('status-color')

  if (!idInput) return

  idInput.value = status.id
  nameInput.value = status.name || ''
  colorInput.value = status.color || '#0d6efd'
}

function clearForm () {
  const idInput = document.getElementById('status-id')
  const nameInput = document.getElementById('status-name')
  const colorInput = document.getElementById('status-color')

  if (!idInput) return

  idInput.value = ''
  nameInput.value = ''
  colorInput.value = '#0d6efd'
}
