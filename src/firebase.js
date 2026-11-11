import {getApps, initializeApp} from 'firebase/app'
import {getAuth} from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

// Os valores vêm do arquivo .env (veja .env.example).
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)

// Cache local: o app continua funcionando sem internet e sincroniza ao voltar.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
})

// Segundo app, usado só para criar logins de funcionários sem derrubar a sessão
// de quem está logado (veja createUnitUser em services/users.js).
export const getSecondaryAuth = () => {
  const existing = getApps().find(each => each.name === 'secondary')
  return getAuth(existing || initializeApp(firebaseConfig, 'secondary'))
}