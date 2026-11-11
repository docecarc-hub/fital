import {useEffect, useState} from 'react'
import {onAuthStateChanged} from 'firebase/auth'

import {auth} from './firebase'
import {subscribeProfile} from './services/users'
import {ROLES} from './utils/permissions'
import AccessScreen from './components/AccessScreen'
import Appointments from './components/Appointments'
import Login from './components/Login'

import './App.css'

const Splash = () => (
  <div className="splash">
    <div className="spinner" />
    <span>Carregando...</span>
  </div>
)

const App = () => {
  // undefined = ainda verificando se há alguém logado; null = deslogado.
  const [user, setUser] = useState(undefined)
  // undefined = carregando; null = login sem perfil cadastrado.
  const [profile, setProfile] = useState(undefined)
  const [profileError, setProfileError] = useState(false)

  useEffect(() => onAuthStateChanged(auth, setUser), [])

  // Escuta o perfil em tempo real: mudança de cargo ou desativação vale na hora.
  useEffect(() => {
    setProfile(undefined)
    setProfileError(false)
    if (!user) return undefined

    return subscribeProfile(user.uid, setProfile, error => {
      console.error(error)
      setProfileError(true)
    })
  }, [user])

  if (user === undefined) return <Splash />
  if (!user) return <Login />

  if (profileError) return <AccessScreen variant="error" />
  if (profile === undefined) return <Splash />

  const isValid = profile && ROLES[profile.role] && profile.unitId
  if (!isValid) return <AccessScreen variant="no-profile" uid={user.uid} />
  if (profile.active === false) return <AccessScreen variant="inactive" />

  return <Appointments unitId={profile.unitId} profile={profile} />
}

export default App