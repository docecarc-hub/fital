// Dinheiro: o campo guarda só os dígitos digitados (centavos) e mostra "R$ 1.234,56".
const brl = new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'})

export const formatBRL = value => brl.format(Number(value) || 0)

// "12345" -> 123.45
export const digitsToValue = digits => Number(digits || 0) / 100

// 123.45 -> "12345"
export const valueToDigits = value =>
  value ? String(Math.round(Number(value) * 100)) : ''

export const onlyDigits = text => String(text || '').replace(/\D/g, '')

// Campos obrigatórios do agendamento (observações NÃO entra aqui).
const REQUIRED_FIELDS = [
  {key: 'client', label: 'Cliente'},
  {key: 'car', label: 'Carro'},
  {key: 'service', label: 'Serviço'},
  {key: 'date', label: 'Data'},
  {key: 'time', label: 'Horário'},
  {key: 'price', label: 'Valor'},
]

// Devolve a lista de campos que ainda faltam (vazia = pode salvar).
export const getMissingFields = values =>
  REQUIRED_FIELDS.filter(({key}) => {
    const value = values[key]
    if (key === 'price') {
      return !(Number(value) > 0)
    }
    return String(value || '').trim() === ''
  })

// Agendamentos antigos só tinham "title"; usamos ele como cliente enquanto não forem editados.
export const getClientName = appointment =>
  appointment.client || appointment.title || ''

// Texto curto para título de evento na agenda.
export const getEventTitle = appointment => {
  const parts = [
    getClientName(appointment),
    appointment.car,
    appointment.service,
  ].filter(Boolean)
  return parts.join(' - ')
}