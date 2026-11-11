import {getApp} from 'firebase/app'
import {deleteDoc, doc, serverTimestamp, setDoc} from 'firebase/firestore'
import {deleteToken, getMessaging, getToken, isSupported, onMessage} from 'firebase/messaging'

import {auth, db, firebaseConfig} from '../firebase'

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY
// Endereço do Worker da Cloudflare que envia os avisos (veja worker/index.js).
const NOTIFY_URL = import.meta.env.VITE_NOTIFY_URL

// Guardados no aparelho: o usuário ligou os avisos? e qual é o token dele?
const ENABLED_KEY = 'push-enabled'
const TOKEN_KEY = 'push-token'

// Cada aparelho tem um token. Guardamos em fcmTokens/{token} com o dono (uid) e a
// unidade; o Worker lê essa coleção para saber quem avisar.
const tokenDoc = token => doc(db, 'fcmTokens', token)

const getMessagingInstance = () => getMessaging(getApp())

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true

/**
 * Diz se este aparelho consegue receber avisos:
 * 'ok' | 'not-configured' | 'ios-install' | 'unsupported'
 */
export const getPushSupport = async () => {
  if (!VAPID_KEY) return 'not-configured'
  // No iPhone, o aviso só funciona com o app instalado na Tela de Início.
  if (isIos() && !isStandalone()) return 'ios-install'
  const hasApis =
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'Notification' in window &&
    'PushManager' in window
  if (!hasApis) return 'unsupported'
  return (await isSupported()) ? 'ok' : 'unsupported'
}

/** O usuário já ligou os avisos neste aparelho (e o navegador ainda permite)? */
export const isPushEnabled = () =>
  'Notification' in window &&
  Notification.permission === 'granted' &&
  localStorage.getItem(ENABLED_KEY) === '1'

const registerWorker = async () => {
  const query = new URLSearchParams({
    apiKey: firebaseConfig.apiKey,
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
    storageBucket: firebaseConfig.storageBucket,
    messagingSenderId: firebaseConfig.messagingSenderId,
    appId: firebaseConfig.appId,
  })
  await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${query}`)
  // Espera o service worker ficar ATIVO. Na primeira vez ele ainda está instalando
  // e o navegador recusa o pedido do token ("no active Service Worker").
  return navigator.serviceWorker.ready
}

/**
 * Pede permissão (se ainda não tiver), pega o token do aparelho e registra para
 * o usuário/unidade atual. Pode ser chamado de novo sem problema (renova o registro).
 * Devolve a permissão: 'granted' | 'denied' | 'default'.
 */
export const enablePush = async ({uid, unitId}) => {
  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission()
  if (permission !== 'granted') return permission

  const registration = await registerWorker()
  const token = await getToken(getMessagingInstance(), {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  })
  if (!token) throw new Error('Não foi possível obter o token de notificação.')

  await setDoc(tokenDoc(token), {
    uid,
    unitId,
    userAgent: navigator.userAgent,
    updatedAt: serverTimestamp(),
  })

  localStorage.setItem(ENABLED_KEY, '1')
  localStorage.setItem(TOKEN_KEY, token)
  return 'granted'
}

/** Desliga os avisos neste aparelho. */
export const disablePush = async () => {
  const token = localStorage.getItem(TOKEN_KEY)
  localStorage.removeItem(ENABLED_KEY)
  localStorage.removeItem(TOKEN_KEY)

  if (token) await deleteDoc(tokenDoc(token)).catch(console.error)
  await deleteToken(getMessagingInstance()).catch(() => {})
}

/**
 * Chamado ao sair da conta: tira o aparelho da lista de quem recebe avisos,
 * mas mantém a preferência — ao entrar de novo, o registro é refeito sozinho.
 */
export const releasePushToken = async () => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) return
  await deleteDoc(tokenDoc(token)).catch(console.error)
}

/** Avisos que chegam com o app aberto na tela (o navegador não mostra sozinho). */
export const listenForeground = callback =>
  onMessage(getMessagingInstance(), payload => callback(payload.data || {}))

/**
 * Pede ao Worker para avisar a unidade sobre um agendamento recém-criado.
 * Nunca lança erro: se o aviso falhar, o agendamento já está salvo do mesmo jeito.
 */
export const notifyNewAppointment = async appointmentId => {
  if (!NOTIFY_URL) {
    console.warn('Avisos desligados: falta VITE_NOTIFY_URL no .env.')
    return
  }
  try {
    const idToken = await auth.currentUser?.getIdToken()
    if (!idToken || !appointmentId) return

    const response = await fetch(NOTIFY_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`},
      body: JSON.stringify({appointmentId}),
    })
    if (!response.ok) {
      console.warn('O Worker recusou o aviso:', response.status, await response.text())
    }
  } catch (error) {
    console.warn('Não foi possível pedir o aviso de novo agendamento.', error)
  }
}