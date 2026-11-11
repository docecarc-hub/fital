import {useEffect, useRef, useState} from 'react'
import {signOut} from 'firebase/auth'
import {differenceInCalendarDays, format, isValid, parse} from 'date-fns'
import {ptBR} from 'date-fns/locale'

import {auth} from '../../firebase'
import {
  addAppointment,
  removeAppointment,
  setAppointmentCompleted,
  subscribeAppointments,
  updateAppointment,
} from '../../services/appointments'
import {
  digitsToValue,
  formatBRL,
  getClientName,
  getMissingFields,
  onlyDigits,
} from '../../utils/appointment'
import AppointmentItem from '../AppointmentItem'
import UsersAdmin from '../UsersAdmin'
import NotificationsToggle from '../NotificationsToggle'
import {notifyNewAppointment, releasePushToken} from '../../services/notifications'
import {ROLES, ROLE_HINTS, can} from '../../utils/permissions'
import logoImg from '../../assets/logo-car-doce-car.png'

import './index.css'

const ISO = 'yyyy-MM-dd'

const parseIso = isoDate => {
  const parsed = parse(isoDate || '', ISO, new Date())
  return isValid(parsed) ? parsed : null
}

// Tira acentos e maiúsculas para a busca ignorar "São" x "sao", etc.
const normalizeText = text =>
  String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

// Junta tudo que dá para pesquisar em um agendamento: cliente, carro, serviço, observações, valor,
// horário e a data em vários formatos (2026-11-10, 10/11/2026, "10 de novembro", "terça-feira").
const buildSearchText = appointment => {
  const {description, date, time, car, service, price} = appointment
  const parsedDate = parseIso(date)
  const dateTexts = parsedDate
    ? [
        date,
        format(parsedDate, 'dd/MM/yyyy'),
        format(parsedDate, "dd 'de' MMMM 'de' yyyy, EEEE", {locale: ptBR}),
      ]
    : [date]

  const priceTexts = price ? [formatBRL(price), String(price)] : []

  return normalizeText(
    [
      getClientName(appointment),
      car,
      service,
      description,
      time,
      ...priceTexts,
      ...dateTexts,
    ].join(' '),
  )
}

const isDone = appointment => appointment.isCompleted === true

// Cada aba decide quais agendamentos mostrar. "today" é a data de hoje (yyyy-MM-dd).
const TABS = [
  {id: 'today', label: 'Hoje', filter: (a, today) => a.date === today},
  {
    id: 'upcoming',
    label: 'Próximos',
    filter: (a, today) => !isDone(a) && a.date > today,
  },
  {
    id: 'overdue',
    label: 'Atrasados',
    filter: (a, today) => !isDone(a) && a.date < today,
  },
  {id: 'done', label: 'Concluídos', filter: a => isDone(a)},
  {id: 'all', label: 'Todos', filter: () => true},
]

const EMPTY_MESSAGES = {
  today: 'Nenhum agendamento para hoje.',
  upcoming: 'Nenhum agendamento futuro.',
  overdue: 'Tudo em dia! Nenhum agendamento passado sem confirmação.',
  done: 'Nenhum serviço concluído ainda.',
  all: 'Nenhum agendamento ainda. Adicione o primeiro.',
}

const getGroupLabel = (isoDate, todayDate) => {
  const parsed = parseIso(isoDate)
  if (!parsed) {
    return {main: 'Sem data', sub: ''}
  }
  const diff = differenceInCalendarDays(parsed, todayDate)
  const full = format(parsed, "EEEE, dd 'de' MMMM", {locale: ptBR})
  if (diff === 0) return {main: 'Hoje', sub: full}
  if (diff === 1) return {main: 'Amanhã', sub: full}
  if (diff === -1) return {main: 'Ontem', sub: full}
  return {main: full, sub: format(parsed, 'yyyy')}
}

const groupByDate = list => {
  const groups = []
  list.forEach(item => {
    const last = groups[groups.length - 1]
    if (last && last.date === item.date) {
      last.items.push(item)
    } else {
      groups.push({date: item.date, items: [item]})
    }
  })
  return groups
}

const Appointments = ({unitId, profile}) => {
  // O que este cargo pode fazer (tabela em utils/permissions.js).
  const canCreate = can(profile.role, 'create')
  const canEdit = can(profile.role, 'edit')
  const canEditPrice = can(profile.role, 'editPrice')
  const canComplete = can(profile.role, 'complete')
  const canStar = can(profile.role, 'star')
  const canDelete = can(profile.role, 'delete')
  const canManageUsers = can(profile.role, 'manageUsers')
  const roleHint = ROLE_HINTS[profile.role]

  const [appointmentsList, setAppointmentsList] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [now, setNow] = useState(() => new Date())
  const [clientInput, setClientInput] = useState('')
  const [carInput, setCarInput] = useState('')
  const [serviceInput, setServiceInput] = useState('')
  const [descriptionInput, setDescriptionInput] = useState('')
  const [priceDigits, setPriceDigits] = useState('')
  const [formMissing, setFormMissing] = useState([])
  const [dateInput, setDateInput] = useState(() => format(new Date(), ISO))
  const [timeInput, setTimeInput] = useState('')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isUsersOpen, setIsUsersOpen] = useState(false)
  const [isFilterActive, setIsFilterActive] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [activeTab, setActiveTab] = useState('today')
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  // Atualiza "agora" a cada minuto para os avisos de horário/atraso.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  // Escuta o banco em tempo real filtrado estritamente pela unidade atual.
  useEffect(
    () =>
      subscribeAppointments(
        unitId,
        list => {
          setAppointmentsList(list)
          setLoadError('')
          setIsLoading(false)
        },
        error => {
          console.error(error)
          setLoadError('Não foi possível carregar os agendamentos.')
          setIsLoading(false)
        },
      ),
    [unitId],
  )

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const showToast = (message, undo) => {
    clearTimeout(toastTimer.current)
    setToast({message, undo})
    toastTimer.current = setTimeout(() => setToast(null), 6000)
  }

  const todayIso = format(now, ISO)

  const onAddAppointment = event => {
    event.preventDefault()
    if (!canCreate) return

    const values = {
      client: clientInput.trim(),
      car: carInput.trim(),
      service: serviceInput.trim(),
      date: dateInput,
      time: timeInput,
      price: digitsToValue(priceDigits),
    }

    // Só salva com tudo preenchido (observações é a única opcional).
    const missing = getMissingFields(values)
    if (missing.length > 0) {
      setFormMissing(missing.map(each => each.key))
      return
    }

    addAppointment(unitId, {
      ...values,
      description: descriptionInput.trim(),
      isStarred: false,
      isCompleted: false,
      // Usado para avisar a unidade (e não avisar quem criou).
      createdBy: profile.uid,
      createdByName: profile.name,
    }).then(
      // Depois de salvo, pede ao Worker para mandar a notificação.
      id => notifyNewAppointment(id),
      error => {
        console.error(error)
        window.alert('Não foi possível salvar o agendamento.')
      },
    )

    const savedDate = parseIso(dateInput)
    showToast(
      savedDate
        ? `Agendamento adicionado para ${format(savedDate, 'dd/MM')} às ${timeInput}`
        : 'Agendamento adicionado',
    )

    setClientInput('')
    setCarInput('')
    setServiceInput('')
    setDescriptionInput('')
    setPriceDigits('')
    setFormMissing([])
    setDateInput(todayIso)
    setTimeInput('')
    setIsFormOpen(false)
  }

  // Ao corrigir um campo, tira o aviso dele.
  const clearMissing = key =>
    setFormMissing(prev => (prev.includes(key) ? prev.filter(k => k !== key) : prev))

  const toggleIsStarred = id => {
    if (!canStar) return
    const item = appointmentsList.find(each => each.id === id)
    if (item) {
      updateAppointment(unitId, id, {isStarred: !item.isStarred}).catch(
        console.error,
      )
    }
  }

  const onToggleComplete = id => {
    if (!canComplete) return
    const item = appointmentsList.find(each => each.id === id)
    if (!item) {
      return
    }
    const nextValue = !isDone(item)
    setAppointmentCompleted(unitId, id, nextValue).catch(error => {
      console.error(error)
      window.alert('Não foi possível atualizar o agendamento.')
    })
    if (nextValue) {
      showToast('Serviço marcado como realizado', () =>
        setAppointmentCompleted(unitId, id, false).catch(console.error),
      )
    }
  }

  const onEditAppointment = (id, updatedFields) => {
    if (!canEdit) return
    updateAppointment(unitId, id, updatedFields).catch(console.error)
  }

  const onDeleteAppointment = id => {
    if (!canDelete) return
    removeAppointment(unitId, id).catch(console.error)
  }

  const searchTerms = normalizeText(searchInput).split(/\s+/).filter(Boolean)
  const isSearching = searchTerms.length > 0

  const countFor = tabId => {
    const tab = TABS.find(each => each.id === tabId)
    return appointmentsList.filter(each => tab.filter(each, todayIso)).length
  }

  // Números das abas: o que ainda falta fazer (Hoje, Próximos, Atrasados) e o total de concluídos.
  const pendingToday = appointmentsList.filter(
    each => each.date === todayIso && !isDone(each),
  ).length
  const todayTotal = countFor('today')
  const todayDoneCount = todayTotal - pendingToday
  const overdueCount = countFor('overdue')
  const tabBadges = {
    today: pendingToday,
    upcoming: countFor('upcoming'),
    overdue: overdueCount,
    done: countFor('done'),
    all: null,
  }

  // Na pesquisa, procura em todos os agendamentos, independente da aba.
  const currentTab = TABS.find(each => each.id === activeTab)
  const visibleList = appointmentsList.filter(each => {
    if (isFilterActive && !each.isStarred) {
      return false
    }
    if (isSearching) {
      const searchText = buildSearchText(each)
      return searchTerms.every(term => searchText.includes(term))
    }
    return currentTab.filter(each, todayIso)
  })

  // Concluídos: do mais recente para o mais antigo. Demais abas: ordem cronológica.
  const orderedList =
    activeTab === 'done' && !isSearching
      ? [...visibleList].reverse()
      : visibleList
  const groups = groupByDate(orderedList)

  const totalLabel =
    orderedList.length === 1
      ? isSearching
        ? '1 resultado'
        : '1 agendamento'
      : `${orderedList.length} ${isSearching ? 'resultados' : 'agendamentos'}`

  const progress = todayTotal === 0 ? 0 : (todayDoneCount / todayTotal) * 100

  const emptyMessage = isSearching
    ? 'Nenhum agendamento encontrado para essa pesquisa.'
    : isFilterActive
      ? 'Nenhum agendamento favorito nesta aba.'
      : EMPTY_MESSAGES[activeTab]

  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-brand">
            <img
              src={logoImg}
              alt="Car Doce Car Auto Service"
              className="topbar-logo"
            />
            <span className="unit-label-badge">Unidade: {unitId.toUpperCase()}</span>
          </div>
          <div className="topbar-actions">
            <span className="user-badge" title={profile.email}>
              <span className="user-badge-name">{profile.name}</span>
              <span className={`role-tag role-${profile.role}`}>
                {ROLES[profile.role].label}
              </span>
            </span>
            <NotificationsToggle
              uid={profile.uid}
              unitId={unitId}
              onMessage={message => showToast(message)}
            />
            {canManageUsers && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setIsUsersOpen(true)}
              >
                Usuários
              </button>
            )}
            {canCreate && (
              <button
                type="button"
                className="btn btn-primary btn-new"
                onClick={() => setIsFormOpen(prev => !prev)}
                aria-expanded={isFormOpen}
              >
                {isFormOpen ? 'Fechar' : '+ Novo'}
              </button>
            )}
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => releasePushToken().finally(() => signOut(auth))}
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className={`layout ${canCreate ? '' : 'layout-single'}`}>
        {canCreate && (
          <aside className={`new-panel ${isFormOpen ? 'is-open' : ''}`}>
            <form className="new-form" onSubmit={onAddAppointment} noValidate>
              <h2 className="panel-title">Novo agendamento</h2>

              <div className="field">
                <label htmlFor="client" className="label">
                  Cliente
                </label>
                <input
                  type="text"
                  id="client"
                  value={clientInput}
                  onChange={event => {
                    setClientInput(event.target.value)
                    clearMissing('client')
                  }}
                  className={`input ${formMissing.includes('client') ? 'input-error' : ''}`}
                  placeholder="Nome do cliente"
                  aria-invalid={formMissing.includes('client')}
                  autoComplete="off"
                />
              </div>

              <div className="field">
                <label htmlFor="car" className="label">
                  Carro
                </label>
                <input
                  type="text"
                  id="car"
                  value={carInput}
                  onChange={event => {
                    setCarInput(event.target.value)
                    clearMissing('car')
                  }}
                  className={`input ${formMissing.includes('car') ? 'input-error' : ''}`}
                  placeholder="Ex.: Gol 2015 prata - ABC-1234"
                  aria-invalid={formMissing.includes('car')}
                  autoComplete="off"
                />
              </div>

              <div className="field">
                <label htmlFor="service" className="label">
                  Serviço a ser realizado
                </label>
                <input
                  type="text"
                  id="service"
                  value={serviceInput}
                  onChange={event => {
                    setServiceInput(event.target.value)
                    clearMissing('service')
                  }}
                  className={`input ${formMissing.includes('service') ? 'input-error' : ''}`}
                  placeholder="Ex.: Troca de óleo e filtros"
                  aria-invalid={formMissing.includes('service')}
                  autoComplete="off"
                />
              </div>

              <div className="field">
                <label htmlFor="description" className="label">
                  Observações <span className="optional">(opcional)</span>
                </label>
                <textarea
                  id="description"
                  value={descriptionInput}
                  onChange={event => setDescriptionInput(event.target.value)}
                  className="input textarea"
                  placeholder="Detalhes adicionais, se necessário..."
                  rows={3}
                />
              </div>

              <div className="field-row">
                <div className="field">
                  <label htmlFor="date" className="label">
                    Data
                  </label>
                  <input
                    type="date"
                    id="date"
                    value={dateInput}
                    onChange={event => {
                      setDateInput(event.target.value)
                      clearMissing('date')
                    }}
                    className={`input ${formMissing.includes('date') ? 'input-error' : ''}`}
                    aria-invalid={formMissing.includes('date')}
                  />
                </div>
                <div className="field">
                  <label htmlFor="time" className="label">
                    Horário
                  </label>
                  <input
                    type="time"
                    id="time"
                    value={timeInput}
                    onChange={event => {
                      setTimeInput(event.target.value)
                      clearMissing('time')
                    }}
                    className={`input ${formMissing.includes('time') ? 'input-error' : ''}`}
                    aria-invalid={formMissing.includes('time')}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="price" className="label">
                  Valor do serviço
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  id="price"
                  value={priceDigits === '' ? '' : formatBRL(digitsToValue(priceDigits))}
                  onChange={event => {
                    setPriceDigits(onlyDigits(event.target.value).replace(/^0+/, ''))
                    clearMissing('price')
                  }}
                  className={`input ${formMissing.includes('price') ? 'input-error' : ''}`}
                  placeholder="R$ 0,00"
                  aria-invalid={formMissing.includes('price')}
                  autoComplete="off"
                />
              </div>

              {formMissing.length > 0 && (
                <p className="form-error" role="alert">
                  Preencha todos os campos obrigatórios para agendar. Falta:{' '}
                  {formMissing
                    .map(
                      key =>
                        ({
                          client: 'cliente',
                          car: 'carro',
                          service: 'serviço',
                          date: 'data',
                          time: 'horário',
                          price: 'valor',
                        })[key],
                    )
                    .join(', ')}
                  .
                </p>
              )}

              <button type="submit" className="btn btn-primary btn-block">
                Adicionar
              </button>
            </form>
          </aside>
        )}

        <section className="list-section">
          {roleHint && <p className="role-note">{roleHint}</p>}
          <div className="today-card">
            <div className="today-top">
              <div>
                <p className="today-eyebrow">Hoje</p>
                <h1 className="today-date">
                  {format(now, "EEEE, dd 'de' MMMM", {locale: ptBR})}
                </h1>
              </div>
              <div className="today-numbers">
                <span className="today-big">{todayDoneCount}</span>
                <span className="today-of">de {todayTotal} concluídos</span>
              </div>
            </div>
            <div
              className="progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={todayTotal}
              aria-valuenow={todayDoneCount}
              aria-label="Serviços concluídos hoje"
            >
              <div className="progress-bar" style={{width: `${progress}%`}} />
            </div>
            <p className="today-hint">
              {todayTotal === 0
                ? 'Nenhum serviço agendado para hoje.'
                : pendingToday === 0
                  ? 'Todos os serviços de hoje foram realizados. 🎉'
                  : pendingToday === 1
                    ? 'Falta 1 serviço para hoje.'
                    : `Faltam ${pendingToday} serviços para hoje.`}
            </p>
          </div>

          {overdueCount > 0 && activeTab !== 'overdue' && !isSearching && (
            <div className="alert-banner" role="status">
              <span>
                <strong>
                  {overdueCount === 1
                    ? '1 agendamento passou'
                    : `${overdueCount} agendamentos passaram`}
                </strong>{' '}
                sem confirmação de serviço realizado.
              </span>
              <button
                type="button"
                className="alert-button"
                onClick={() => setActiveTab('overdue')}
              >
                Revisar
              </button>
            </div>
          )}

          <div className="toolbar">
            <div className="search-box">
              <svg
                className="search-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  cx="11"
                  cy="11"
                  r="7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M20 20l-3.5-3.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <input
                type="text"
                id="search"
                value={searchInput}
                onChange={event => setSearchInput(event.target.value)}
                className="search-input"
                placeholder="Pesquisar por cliente, carro, serviço, data ou horário"
                aria-label="Pesquisar agendamentos"
                autoComplete="off"
              />
              {isSearching && (
                <button
                  type="button"
                  className="search-clear"
                  onClick={() => setSearchInput('')}
                  aria-label="Limpar pesquisa"
                >
                  ×
                </button>
              )}
            </div>
            <button
              type="button"
              className={`chip ${isFilterActive ? 'chip-active' : ''}`}
              onClick={() => setIsFilterActive(prev => !prev)}
              aria-pressed={isFilterActive}
            >
              <span aria-hidden="true">{isFilterActive ? '★' : '☆'}</span>{' '}
              Favoritos
            </button>
          </div>

          {isSearching ? (
            <p className="search-note">
              Pesquisando em todos os agendamentos.
            </p>
          ) : (
            <div className="tabs" role="tablist" aria-label="Filtrar agendamentos">
              {TABS.map(tab => {
                const badge = tabBadges[tab.id]
                const isActive = tab.id === activeTab
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`tab ${isActive ? 'tab-active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                    {badge !== null && badge > 0 && (
                      <span
                        className={`tab-badge ${
                          tab.id === 'overdue' ? 'tab-badge-alert' : ''
                        }`}
                      >
                        {badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {!isLoading && loadError === '' && orderedList.length > 0 && (
            <p className="list-count" aria-live="polite">
              {totalLabel}
            </p>
          )}

          {isLoading ? (
            <div className="state-box">
              <div className="spinner" />
              <p>Carregando...</p>
            </div>
          ) : loadError !== '' ? (
            <div className="state-box">
              <p>{loadError}</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="state-box">
              <svg className="state-icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect
                  x="3.5"
                  y="5"
                  width="17"
                  height="15"
                  rx="3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path
                  d="M3.5 10h17M8 3.5v3M16 3.5v3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              <p>{emptyMessage}</p>
            </div>
          ) : (
            groups.map(group => {
              const label = getGroupLabel(group.date, now)
              return (
                <div className="day-group" key={group.date}>
                  <div className="day-header">
                    <h2 className="day-title">{label.main}</h2>
                    {label.sub !== '' && (
                      <span className="day-sub">{label.sub}</span>
                    )}
                    <span className="day-count">{group.items.length}</span>
                  </div>
                  <ul className="appointments-list">
                    {group.items.map(eachAppointment => (
                      <AppointmentItem
                        key={eachAppointment.id}
                        appointmentDetails={eachAppointment}
                        now={now}
                        toggleIsStarred={toggleIsStarred}
                        onToggleComplete={onToggleComplete}
                        onEditAppointment={onEditAppointment}
                        onDeleteAppointment={onDeleteAppointment}
                        permissions={{
                          canStar,
                          canComplete,
                          canEdit,
                          canEditPrice,
                          canDelete,
                        }}
                      />
                    ))}
                  </ul>
                </div>
              )
            })
          )}
        </section>
      </main>

      {isUsersOpen && canManageUsers && (
        <UsersAdmin
          unitId={unitId}
          currentUid={profile.uid}
          onClose={() => setIsUsersOpen(false)}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                toast.undo()
                setToast(null)
              }}
            >
              Desfazer
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default Appointments