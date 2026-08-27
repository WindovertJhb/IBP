// components/teams.js
import * as api from '../api.supabase.js'
import { escapeHtml } from './dom.js'

let teams = []
let people = []

export function initTeams () {
  setupHandlers()
  window.addEventListener('peopleUpdated', refreshTeams)
  refreshTeams()
}

async function refreshTeams () {
  try {
    ;[teams, people] = await Promise.all([api.getTeams(), api.getPeople()])
  } catch (err) {
    console.error('Failed to load teams', err)
    teams = []
  }
  populateLeadSelect()
  renderMemberChecklist()
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

function personName (id) {
  const p = people.find(x => String(x.id) === String(id))
  return p ? p.name : ''
}

function populateLeadSelect () {
  const select = document.getElementById('team-lead')
  if (!select) return
  const prev = select.value

  select.innerHTML = '<option value="">— None —</option>'
  people.forEach(p => {
    const opt = document.createElement('option')
    opt.value = p.id
    opt.textContent = p.name
    select.appendChild(opt)
  })

  if (prev && people.some(p => String(p.id) === String(prev))) {
    select.value = prev
  }
}

function renderMemberChecklist (selectedIds = []) {
  const container = document.getElementById('team-members')
  if (!container) return

  if (!people.length) {
    container.innerHTML = '<div class="text-muted small">No people yet. Add them on the People tab.</div>'
    return
  }

  const selected = new Set(selectedIds.map(String))

  container.innerHTML = people
    .map(p => {
      const idStr = String(p.id)
      const checked = selected.has(idStr) ? 'checked' : ''
      return `
        <div class="form-check form-check-sm">
          <input class="form-check-input" type="checkbox" value="${p.id}" id="team-member-${p.id}" ${checked} />
          <label class="form-check-label" for="team-member-${p.id}">
            ${escapeHtml(p.name)}
            <span class="text-muted small">(${escapeHtml(p.role || '')})</span>
          </label>
        </div>
      `
    })
    .join('')
}

function renderTeamsTable () {
  const tbody = document.querySelector('#teams-table tbody')
  if (!tbody) return

  if (!teams.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-muted small text-center py-3">
          No teams yet. Add your first install team on the left.
        </td>
      </tr>
    `
    return
  }

  tbody.innerHTML = teams
    .map(t => {
      const leadName = t.teamLeadId ? personName(t.teamLeadId) : ''
      const memberCount = Array.isArray(t.memberIds) ? t.memberIds.length : 0
      return `
        <tr data-team-id="${t.id}">
          <td>${escapeHtml(t.name)}</td>
          <td>${escapeHtml(leadName)}</td>
          <td>${memberCount}</td>
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
  const leadSelect = document.getElementById('team-lead')
  const membersContainer = document.getElementById('team-members')

  const id = idInput.value || null
  const name = nameInput.value.trim()
  const teamLeadId = leadSelect.value || null

  if (!name) {
    nameInput.focus()
    return
  }

  const memberIds = membersContainer
    ? Array.from(membersContainer.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value)
    : []

  const payload = { name, teamLeadId, memberIds }

  try {
    if (id) {
      await api.updateTeam({ id, ...payload })
    } else {
      await api.createTeam(payload)
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
  const leadSelect = document.getElementById('team-lead')

  if (!idInput) return

  idInput.value = team.id
  nameInput.value = team.name || ''
  leadSelect.value = team.teamLeadId != null ? String(team.teamLeadId) : ''

  renderMemberChecklist(team.memberIds || [])
}

function clearForm () {
  const idInput = document.getElementById('team-id')
  const nameInput = document.getElementById('team-name')
  const leadSelect = document.getElementById('team-lead')

  if (!idInput) return

  idInput.value = ''
  nameInput.value = ''
  leadSelect.value = ''

  renderMemberChecklist([])
}
