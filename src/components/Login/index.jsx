import {useState} from 'react'
import {signInWithEmailAndPassword} from 'firebase/auth'

import {auth} from '../../firebase'
import logoImg from '../../assets/logo-car-doce-car.png'

import './index.css'

const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const onSubmit = async event => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (err) {
      setError('E-mail ou senha incorretos.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <img
          src={logoImg}
          alt="Car Doce Car Auto Service"
          className="login-logo"
        />
        <h1 className="login-title">Bem-vindo</h1>
        <p className="login-subtitle">Entre para ver seus agendamentos</p>

        <div className="login-field">
          <label htmlFor="login-email" className="login-label">
            E-mail
          </label>
          <input
            type="email"
            id="login-email"
            className="login-input"
            placeholder="seu@email.com"
            autoComplete="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            required
          />
        </div>

        <div className="login-field">
          <label htmlFor="login-password" className="login-label">
            Senha
          </label>
          <div className="login-input-wrap">
            <input
              type={showPassword ? 'text' : 'password'}
              id="login-password"
              className="login-input has-toggle"
              placeholder="Sua senha"
              autoComplete="current-password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              className="login-toggle"
              onClick={() => setShowPassword(prev => !prev)}
              aria-pressed={showPassword}
            >
              {showPassword ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
        </div>

        {error !== '' && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="login-button" disabled={isSubmitting}>
          {isSubmitting ? 'Entrando...' : 'Entrar'}
        </button>

        <p className="login-footer">Car Doce Car Auto Service</p>
      </form>
    </div>
  )
}

export default Login