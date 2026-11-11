import {addMinutes, format, isValid, parse} from 'date-fns'

import {formatBRL, getEventTitle} from './appointment'

// Duração padrão do evento e antecedência do lembrete (em minutos).
export const EVENT_DURATION_MINUTES = 60
export const REMINDER_MINUTES = 30

const toCalendarStamp = dateObj => format(dateObj, "yyyyMMdd'T'HHmmss")

// Junta a data (yyyy-MM-dd) e a hora (HH:mm) guardadas no agendamento.
const getEventRange = ({date, time}) => {
  const start = parse(`${date} ${time}`, 'yyyy-MM-dd HH:mm', new Date())
  if (!isValid(start)) {
    return null
  }
  return {start, end: addMinutes(start, EVENT_DURATION_MINUTES)}
}

// Observações + valor, para aparecer nos detalhes do evento na agenda.
const getEventDetails = appointment => {
  const lines = []
  if (appointment.price) {
    lines.push(`Valor: ${formatBRL(appointment.price)}`)
  }
  if (appointment.description) {
    lines.push(appointment.description)
  }
  return lines.join('\n')
}

// Link que abre o Google Agenda com o evento já preenchido.
// Obs.: o lembrete usa a notificação padrão da sua agenda do Google.
export const buildGoogleCalendarUrl = appointment => {
  const range = getEventRange(appointment)
  if (!range) {
    return ''
  }
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: getEventTitle(appointment),
    details: getEventDetails(appointment),
    dates: `${toCalendarStamp(range.start)}/${toCalendarStamp(range.end)}`,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

const escapeIcsText = text =>
  String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')

// Gera um arquivo .ics com um alarme REMINDER_MINUTES antes do horário.
export const downloadIcsFile = appointment => {
  const range = getEventRange(appointment)
  if (!range) {
    return
  }
  const stamp = `${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Car Doce Car//Agendamentos//PT-BR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${appointment.id}@cardocecar`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toCalendarStamp(range.start)}`,
    `DTEND:${toCalendarStamp(range.end)}`,
    `SUMMARY:${escapeIcsText(getEventTitle(appointment))}`,
    `DESCRIPTION:${escapeIcsText(getEventDetails(appointment))}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(getEventTitle(appointment))}`,
    `TRIGGER:-PT${REMINDER_MINUTES}M`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  const blob = new Blob([lines.join('\r\n')], {
    type: 'text/calendar;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'agendamento.ics'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}