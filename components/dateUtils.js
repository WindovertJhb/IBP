// components/dateUtils.js

export function getMonday (d) {
  const date = new Date(d)
  const day = date.getDay() || 7 // Sunday → 7
  if (day !== 1) date.setDate(date.getDate() - (day - 1))
  date.setHours(0, 0, 0, 0)
  return date
}

export function addDays (date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function formatDateISO (date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)

  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function formatDateShort (date) {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  })
}
