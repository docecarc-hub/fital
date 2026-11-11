import {useState} from 'react'
import {format, isValid, parse} from 'date-fns'

import {buildGoogleCalendarUrl, downloadIcsFile} from '../../utils/calendar'
import {
  digitsToValue,
  formatBRL,
  getClientName,
  getMissingFields,
  onlyDigits,
  valueToDigits,
} from '../../utils/appointment'

import './index.css'

const ISO = 'yyyy-MM-dd'

// A data é guardada como "yyyy-MM-dd". Usar parse() (e não new Date(string))
// evita o bug de fuso horário que mostrava o dia anterior no Brasil.
const parseDate = isoDate => {
  const parsedDate = parse(isoDate, ISO, new Date())
  return isValid(parsedDate) ? parsedDate : null
}

const formatCompletedAt = completedAt => {
  // Logo após clicar, o servidor ainda não devolveu a hora (fica null por instantes).
  if (!completedAt || typeof completedAt.toDate !== 'function') {
    return ''
  }
  return format(completedAt.toDate(), "dd/MM 'às' HH:mm")
}

const StarIcon = ({isFilled}) => (
  <svg className="star" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55L2.48 9.42l6.58-.96L12 2.5z"
      fill={isFilled ? '#fbbf24' : 'none'}
      stroke={isFilled ? '#f59e0b' : '#7e858e'}
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
)

const CheckIcon = () => (
  <svg className="check-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M5 12.5l4.5 4.5L19 7.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const AppointmentItem = props => {
  const {
    appointmentDetails,
    now,
    toggleIsStarred,
    onToggleComplete,
    onEditAppointment,
    onDeleteAppointment,
    permissions = {},
  } = props
  const {
    canStar = false,
    canComplete = false,
    canEdit = false,
    canEditPrice = false,
    canDelete = false,
  } = permissions
  const {
    id,
    car = '',
    service = '',
    description = '',
    price = 0,
    date,
    time = '',
    isStarred,
    isCompleted,
    completedAt,
  } = appointmentDetails
  const client = getClientName(appointmentDetails)

  const [isEditing, setIsEditing] = useState(false)
  const [draftClient, setDraftClient] = useState(client)
  const [draftCar, setDraftCar] = useState(car)
  const [draftService, setDraftService] = useState(service)
  const [draftPriceDigits, setDraftPriceDigits] = useState(valueToDigits(price))
  const [missing, setMissing] = useState([])
  const [draftDescription, setDraftDescription] = useState(description)
  const [draftDate, setDraftDate] = useState(date)
  const [draftTime, setDraftTime] = useState(time)

  const todayIso = format(now, ISO)
  const isDone = isCompleted === true
  const isOverdue = !isDone && date < todayIso
  const hasTimePassed =
    !isDone && date === todayIso && time !== '' && time <= format(now, 'HH:mm')

  const onClickEdit = () => {
    setDraftClient(client)
    setDraftCar(car)
    setDraftService(service)
    setDraftPriceDigits(valueToDigits(price))
    setDraftDescription(description)
    setDraftDate(date)
    setDraftTime(time)
    setMissing([])
    setIsEditing(true)
  }

  const onSubmitEdit = event => {
    event.preventDefault()

    const values = {
      client: draftClient.trim(),
      car: draftCar.trim(),
      service: draftService.trim(),
      date: draftDate,
      time: draftTime,
    }
    // Quem não pode alterar valor nem envia o campo (o valor atual é mantido).
    if (canEditPrice) {
      values.price = digitsToValue(draftPriceDigits)
    }

    // Mesma regra do cadastro: tudo obrigatório, menos as observações.
    const missingFields = getMissingFields(values).filter(
      each => canEditPrice || each.key !== 'price',
    )
    if (missingFields.length > 0) {
      setMissing(missingFields.map(each => each.key))
      return
    }

    onEditAppointment(id, {
      ...values,
      description: draftDescription.trim(),
    })
    setIsEditing(false)
  }

  const clearMissing = key =>
    setMissing(prev => (prev.includes(key) ? prev.filter(k => k !== key) : prev))
  const errorClass = key => (missing.includes(key) ? 'edit-input-error' : '')

  const onClickDelete = () => {
    if (window.confirm(`Excluir o agendamento de "${client}"?`)) {
      onDeleteAppointment(id)
    }
  }

  if (isEditing) {
    return (
      <li className="appointment-item">
        <form className="edit-form" onSubmit={onSubmitEdit}>
          <label htmlFor={`edit-client-${id}`} className="edit-label">
            Cliente
          </label>
          <input
            type="text"
            id={`edit-client-${id}`}
            className={`edit-input ${errorClass('client')}`}
            value={draftClient}
            onChange={event => {
              setDraftClient(event.target.value)
              clearMissing('client')
            }}
            aria-invalid={missing.includes('client')}
            autoFocus
          />
          <label htmlFor={`edit-car-${id}`} className="edit-label">
            Carro
          </label>
          <input
            type="text"
            id={`edit-car-${id}`}
            className={`edit-input ${errorClass('car')}`}
            value={draftCar}
            onChange={event => {
              setDraftCar(event.target.value)
              clearMissing('car')
            }}
            aria-invalid={missing.includes('car')}
          />
          <label htmlFor={`edit-service-${id}`} className="edit-label">
            Serviço a ser realizado
          </label>
          <input
            type="text"
            id={`edit-service-${id}`}
            className={`edit-input ${errorClass('service')}`}
            value={draftService}
            onChange={event => {
              setDraftService(event.target.value)
              clearMissing('service')
            }}
            aria-invalid={missing.includes('service')}
          />
          <label htmlFor={`edit-description-${id}`} className="edit-label">
            Observações <span className="edit-optional">(opcional)</span>
          </label>
          <textarea
            id={`edit-description-${id}`}
            className="edit-input edit-textarea"
            value={draftDescription}
            onChange={event => setDraftDescription(event.target.value)}
            placeholder="Observações (opcional)"
            rows={3}
          />
          <div className="edit-row">
            <div className="edit-col">
              <label htmlFor={`edit-date-${id}`} className="edit-label">
                Data
              </label>
              <input
                type="date"
                id={`edit-date-${id}`}
                className={`edit-input ${errorClass('date')}`}
                value={draftDate}
                onChange={event => {
                  setDraftDate(event.target.value)
                  clearMissing('date')
                }}
                aria-invalid={missing.includes('date')}
              />
            </div>
            <div className="edit-col">
              <label htmlFor={`edit-time-${id}`} className="edit-label">
                Horário
              </label>
              <input
                type="time"
                id={`edit-time-${id}`}
                className={`edit-input ${errorClass('time')}`}
                value={draftTime}
                onChange={event => {
                  setDraftTime(event.target.value)
                  clearMissing('time')
                }}
                aria-invalid={missing.includes('time')}
              />
            </div>
          </div>
          {canEditPrice && (
            <>
            <label htmlFor={`edit-price-${id}`} className="edit-label">
              Valor do serviço
            </label>
            <input
              type="text"
              inputMode="numeric"
              id={`edit-price-${id}`}
              className={`edit-input ${errorClass('price')}`}
              value={
                draftPriceDigits === ''
                  ? ''
                  : formatBRL(digitsToValue(draftPriceDigits))
              }
              onChange={event => {
                setDraftPriceDigits(
                  onlyDigits(event.target.value).replace(/^0+/, ''),
                )
                clearMissing('price')
              }}
              placeholder="R$ 0,00"
              aria-invalid={missing.includes('price')}
              autoComplete="off"
            />
            </>
          )}
          {missing.length > 0 && (
            <p className="form-error" role="alert">
              Preencha todos os campos obrigatórios (só as observações são
              opcionais).
            </p>
          )}
          <div className="actions-container">
            <button type="submit" className="action-button save-button">
              Salvar
            </button>
            <button
              type="button"
              className="action-button cancel-button"
              onClick={() => setIsEditing(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      </li>
    )
  }

  const completedText = formatCompletedAt(completedAt)
  const showCalendar = !isDone && time !== '' && date >= todayIso

  return (
    <li
      className={`appointment-item ${isDone ? 'is-done' : ''} ${
        isOverdue ? 'is-overdue' : ''
      } ${isStarred ? 'is-starred' : ''}`}
    >
      <div className="card-top">
        <div className="time-block" aria-label={`Horário ${time}`}>
          <span className="time-value">{time || '--:--'}</span>
        </div>
        <div className="card-main">
          <div className="header-container">
            <p className="title">{client}</p>
            {canStar ? (
              <button
                type="button"
                className="star-button"
                onClick={() => toggleIsStarred(id)}
                aria-label={
                  isStarred ? 'Remover dos favoritos' : 'Adicionar aos favoritos'
                }
                aria-pressed={isStarred}
              >
                <StarIcon isFilled={isStarred} />
              </button>
            ) : (
              isStarred && (
                <span className="star-static" aria-label="Favorito">
                  <StarIcon isFilled />
                </span>
              )
            )}
          </div>

          <div className="meta">
            {isDone && (
              <span className="tag tag-done">
                Concluído{completedText !== '' && ` · ${completedText}`}
              </span>
            )}
            {isOverdue && (
              <span className="tag tag-overdue">Aguardando confirmação</span>
            )}
            {hasTimePassed && (
              <span className="tag tag-time-passed">Horário passou</span>
            )}
          </div>

          {(car !== '' || service !== '') && (
            <p className="subtitle">
              {[car, service].filter(Boolean).join(' · ')}
            </p>
          )}

          {Number(price) > 0 && <p className="price">{formatBRL(price)}</p>}

          {description !== '' && (
            <p className="description">
              <span className="description-label">Obs.:</span> {description}
            </p>
          )}
        </div>
      </div>

      <div className="card-footer">
        {canComplete && (
          <>
          {isDone ? (
            <button
              type="button"
              className="action-button reopen-button"
              onClick={() => onToggleComplete(id)}
            >
              Reabrir
            </button>
          ) : (
            <button
              type="button"
              className="action-button complete-button"
              onClick={() => onToggleComplete(id)}
            >
              <CheckIcon />
              {isOverdue ? 'Confirmar realizado' : 'Serviço realizado'}
            </button>
          )}

          </>
        )}

        <div className="actions-container secondary-actions">
          {canEdit && (
            <button
              type="button"
              className="action-button edit-button"
              onClick={onClickEdit}
            >
              Editar
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className="action-button delete-button"
              onClick={onClickDelete}
            >
              Excluir
            </button>
          )}
          {showCalendar && (
            <>
              <a
                className="action-button calendar-button"
                href={buildGoogleCalendarUrl(appointmentDetails)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Agenda
              </a>
              <button
                type="button"
                className="action-button calendar-button"
                onClick={() => downloadIcsFile(appointmentDetails)}
              >
                .ics
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  )
}

export default AppointmentItem