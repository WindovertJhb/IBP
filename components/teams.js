// components/teams.js
import * as api from '../api.supabase.js'
import { escapeHtml } from './dom.js'

let teams = []

export function initTeams () {
  setupHandlers()
  refreshTeams()
}

async function refreshTeams () {
  try {
    teams = await api.getTeams()
  } catch (err) {
    console.error('Failed to load teams', err)
    teams = []
  }
  renderTeamsTable()
}

/* ------------ DOM wiring ------------ */

function setupHandlers () {
  const form = document.getElementById('teams-form')
  const resetBtn = document.getElementById('btn-team-reset')
  const table = document.getElementById('teams-table')

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

function renderTeamsTable () {
  const tbody = document.querySelector('#teams-table tbody')
  if (!tbody) return

  if (!teams.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="2" class="text-muted small text-center py-3">
          No teams yet. Add your first install team on the left.
        </td>
      </tr>
    `
    return
  }

  tbody.innerHTML = teams
    .map(t => {
      return `
        <tr data-team-id="${t.id}">
          <td>${escapeHtml(t.name)}</td>
          <td class="text-end">
            <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete-team">
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

  const idInput = document.getElementById('team-id')
  const nameInput = document.getElementById('team-name')

  const id = idInput.value || null
  const name = nameInput.value.trim()

  if (!name) {
    nameInput.focus()
    return
  }

  try {
    if (id) {
      await api.updateTeam({ id, name })
    } else {
      await api.createTeam({ name })
    }
    window.dispatchEvent(new CustomEvent('teamsUpdated'))

    clearForm()
    await refreshTeams()
  } catch (err) {
    console.error('Failed to save team', err)
    alert('Unable to save team.')
  }
}

function onTableClick (e) {
  const deleteBtn = e.target.closest('[data-action="delete-team"]')
  const row = e.target.closest('tr[data-team-id]')
  if (!row) return

  const id = row.dataset.teamId
  const team = teams.find(t => String(t.id) === String(id))
  if (!team) return

  if (deleteBtn) {
    handleDeleteTeam(team)
  } else {
    fillForm(team)
  }
}

async function handleDeleteTeam (team) {
  if (!confirm(`Delete ${team.name}? Any bookings assigned to this team will also be deleted.`)) return
  try {
    await api.deleteTeam(team.id)
    await refreshTeams()
    window.dispatchEvent(new CustomEvent('teamsUpdated'))
    const idInput = document.getElementById('team-id')
    if (idInput && idInput.value === String(team.id)) {
      clearForm()
    }
  } catch (err) {
    console.error('Failed to delete team', err)
    alert('Unable to delete team.')
  }
}

/* ------------ Form helpers ------------ */

function fillForm (team) {
  const idInput = document.getElementById('team-id')
  const nameInput = document.getElementById('team-name')

  if (!idInput) return

  idInput.value = team.id
  nameInput.value = team.name || ''
}

function clearForm () {
  const idInput = document.getElementById('team-id')
  const nameInput = document.getElementById('team-name')

  if (!idInput) return

  idInput.value = ''
  nameInput.value = ''
}
