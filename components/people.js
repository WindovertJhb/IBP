// components/people.js
//
// This tab manages salespeople only — the "role" concept (fitter/admin/
// other) that used to live here went away along with team membership and
// per-job crew assignment. Every row this tab creates is role: 'sales'.
import * as api from '../api.supabase.js'
import { escapeHtml } from './dom.js'

let people = []

export function initPeople () {
  setupHandlers()
  refreshPeople()
}

async function refreshPeople () {
  try {
    const all = await api.getPeople()
    people = all.filter(p => String(p.role || '').toLowerCase() === 'sales')
  } catch (err) {
    console.error('Failed to load people', err)
    people = []
  }
  renderPeopleTable()
}

/* ------------ DOM wiring ------------ */

function setupHandlers () {
  const form = document.getElementById('people-form')
  const resetBtn = document.getElementById('btn-person-reset')
  const table = document.getElementById('people-table')

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

function renderPeopleTable () {
  const tbody = document.querySelector('#people-table tbody')
  if (!tbody) return

  if (!people.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" class="text-muted small text-center py-3">
          No salespeople yet. Add your first one on the left.
        </td>
      </tr>
    `
    return
  }

  tbody.innerHTML = people
    .map(p => {
      const phone = p.phone || ''
      return `
        <tr data-person-id="${p.id}">
          <td>${escapeHtml(p.name)}</td>
          <td>${escapeHtml(phone)}</td>
          <td class="text-end">
            <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete-person">
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

  const idInput = document.getElementById('person-id')
  const nameInput = document.getElementById('person-name')
  const phoneInput = document.getElementById('person-phone')

  const id = idInput.value || null
  const name = nameInput.value.trim()
  const phone = phoneInput.value.trim()

  if (!name) {
    nameInput.focus()
    return
  }

  const payload = { name, role: 'sales', phone }

  try {
    if (id) {
      await api.updatePerson({ id, ...payload })
    } else {
      await api.createPerson(payload)
    }
    window.dispatchEvent(new CustomEvent('peopleUpdated'))

    clearForm()
    await refreshPeople()
  } catch (err) {
    console.error('Failed to save person', err)
    alert('Unable to save salesperson.')
  }
}

function onTableClick (e) {
  const deleteBtn = e.target.closest('[data-action="delete-person"]')
  const row = e.target.closest('tr[data-person-id]')
  if (!row) return

  const id = row.dataset.personId
  const person = people.find(p => String(p.id) === String(id))
  if (!person) return

  if (deleteBtn) {
    handleDeletePerson(person)
  } else {
    fillForm(person)
  }
}

async function handleDeletePerson (person) {
  if (!confirm(`Delete ${person.name}?`)) return
  try {
    await api.deletePerson(person.id)
    await refreshPeople()
    window.dispatchEvent(new CustomEvent('peopleUpdated'))
    const idInput = document.getElementById('person-id')
    if (idInput && idInput.value === String(person.id)) {
      clearForm()
    }
  } catch (err) {
    console.error('Failed to delete person', err)
    alert('Unable to delete salesperson.')
  }
}

/* ------------ Form helpers ------------ */

function fillForm (person) {
  const idInput = document.getElementById('person-id')
  const nameInput = document.getElementById('person-name')
  const phoneInput = document.getElementById('person-phone')

  if (!idInput) return

  idInput.value = person.id
  nameInput.value = person.name || ''
  phoneInput.value = person.phone || ''
}

function clearForm () {
  const idInput = document.getElementById('person-id')
  const nameInput = document.getElementById('person-name')
  const phoneInput = document.getElementById('person-phone')

  if (!idInput) return

  idInput.value = ''
  nameInput.value = ''
  phoneInput.value = ''
}
