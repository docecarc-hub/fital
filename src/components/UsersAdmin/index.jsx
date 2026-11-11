import {useEffect, useState} from 'react'

import {ROLE_IDS, ROLES} from '../../utils/permissions'
import {
  createUnitUser,
  sendResetEmail,
  subscribeUnitUsers,
  updateUnitUser,
} from '../../services/users'

import './index.css'

const errorMessage = error => {
  switch (error?.code) {
    case 'auth/email-already-in-use':
      return 'Este e-mail já tem um login cadastrado. Se a pessoa já fez parte da equipe, reative o login dela na lista.'
    case 'auth/invalid-email':
      return 'E-mail inválido.'
    case 'auth/weak-password':
      return 'A senha precisa ter pelo menos 6 caracteres.'
    case 'permission-denied':
      return 'Você não tem permissão para esta ação.'
    default:
      return 'Não foi possível concluir a ação. Tente novamente.'
  }
}

const UsersAdmin = ({unitId, currentUid, onClose}) => {
  const [users, setUsers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('vendedor')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(
    () =>
      subscribeUnitUsers(
        unitId,
        list => {
          setUsers(list)
          setLoadError('')
          setIsLoading(false)
        },
        err => {
          console.error(err)
          setLoadError('Não foi possível carregar os usuários.')
          setIsLoading(false)
        },
      ),
    [unitId],
  )

  useEffect(() => {
    const onKeyDown = event => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const onCreate = async event => {
    event.preventDefault()
    setError('')
    setNotice('')

    if (name.trim() === '' || email.trim() === '' || password.length < 6) {
      setError('Preencha nome, e-mail e uma senha de pelo menos 6 caracteres.')
      return
    }

    setIsSubmitting(true)
    try {
      await createUnitUser({
        unitId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
      })
      setNotice(`Login de ${name.trim()} criado. Entregue o e-mail e a senha à pessoa.`)
      setName('')
      setEmail('')
      setPassword('')
      setRole('vendedor')
    } catch (err) {
      console.error(err)
      setError(errorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const run = async (action, successMessage) => {
    setError('')
    setNotice('')
    try {
      await action()
      if (successMessage) setNotice(successMessage)
    } catch (err) {
      console.error(err)
      setError(errorMessage(err))
    }
  }

  const onChangeRole = (user, nextRole) =>
    run(() => updateUnitUser(user.uid, {role: nextRole}), `Cargo de ${user.name} alterado.`)

  const onToggleActive = user => {
    const nextActive = user.active === false
    if (
      !nextActive &&
      !window.confirm(`Desativar o login de "${user.name}"? Ele não conseguirá mais entrar.`)
    ) {
      return
    }
    run(
      () => updateUnitUser(user.uid, {active: nextActive}),
      nextActive ? `Login de ${user.name} reativado.` : `Login de ${user.name} desativado.`,
    )
  }

  const onResetPassword = user =>
    run(
      () => sendResetEmail(user.email),
      `Enviamos um e-mail de redefinição de senha para ${user.email}.`,
    )

  return (
    <div className="users-overlay" role="dialog" aria-modal="true" aria-label="Usuários da unidade">
      <div className="users-modal">
        <div className="users-header">
          <h2 className="users-title">Usuários da unidade</h2>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Fechar
          </button>
        </div>

        <form className="users-form" onSubmit={onCreate} noValidate>
          <h3 className="users-subtitle">Novo login</h3>
          <div className="field">
            <label htmlFor="user-name" className="label">
              Nome
            </label>
            <input
              id="user-name"
              type="text"
              className="input"
              value={name}
              onChange={event => setName(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="user-email" className="label">
              E-mail (será o login)
            </label>
            <input
              id="user-email"
              type="email"
              className="input"
              value={email}
              onChange={event => setEmail(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="user-password" className="label">
                Senha inicial
              </label>
              <input
                id="user-password"
                type="password"
                className="input"
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="Mín. 6 caracteres"
              />
            </div>
            <div className="field">
              <label htmlFor="user-role" className="label">
                Cargo
              </label>
              <select
                id="user-role"
                className="input"
                value={role}
                onChange={event => setRole(event.target.value)}
              >
                {ROLE_IDS.map(id => (
                  <option key={id} value={id}>
                    {ROLES[id].label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
            {isSubmitting ? 'Criando...' : 'Criar login'}
          </button>
        </form>

        {error !== '' && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {notice !== '' && (
          <p className="users-notice" role="status">
            {notice}
          </p>
        )}

        <h3 className="users-subtitle">Logins cadastrados</h3>
        {isLoading ? (
          <p className="users-empty">Carregando...</p>
        ) : loadError !== '' ? (
          <p className="users-empty">{loadError}</p>
        ) : (
          <ul className="users-list">
            {users.map(user => {
              const isSelf = user.uid === currentUid
              const isActive = user.active !== false
              return (
                <li key={user.uid} className={`users-item ${isActive ? '' : 'is-inactive'}`}>
                  <div className="users-info">
                    <p className="users-name">
                      {user.name}
                      {isSelf && <span className="users-self"> (você)</span>}
                      {!isActive && <span className="users-off"> · desativado</span>}
                    </p>
                    <p className="users-email">{user.email}</p>
                  </div>

                  {isSelf ? (
                    <span className="users-role-fixed">{ROLES[user.role]?.label}</span>
                  ) : (
                    <div className="users-actions">
                      <select
                        className="input users-select"
                        value={user.role}
                        onChange={event => onChangeRole(user, event.target.value)}
                        aria-label={`Cargo de ${user.name}`}
                      >
                        {ROLE_IDS.map(id => (
                          <option key={id} value={id}>
                            {ROLES[id].label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => onResetPassword(user)}
                      >
                        Redefinir senha
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => onToggleActive(user)}
                      >
                        {isActive ? 'Desativar' : 'Reativar'}
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

export default UsersAdmin