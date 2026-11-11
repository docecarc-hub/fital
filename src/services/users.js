import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth'
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'

import {auth, db, getSecondaryAuth} from '../firebase'

// Perfil de cada login: users/{uid} = {name, email, role, unitId, active}.
// "unitId" é o uid do primeiro administrador da unidade: os agendamentos da
// unidade ficam em users/{unitId}/appointments (mesmo lugar de sempre).
const userDoc = uid => doc(db, 'users', uid)

const toProfile = snapshot => ({uid: snapshot.id, ...snapshot.data()})

/** Escuta o perfil do usuário logado (cargo, unidade, ativo). null = sem perfil. */
export const subscribeProfile = (uid, onData, onError) =>
  onSnapshot(
    userDoc(uid),
    snapshot => onData(snapshot.exists() ? toProfile(snapshot) : null),
    onError,
  )

/** Escuta todos os logins da unidade (só o administrativo consegue ler). */
export const subscribeUnitUsers = (unitId, onData, onError) =>
  onSnapshot(
    query(collection(db, 'users'), where('unitId', '==', unitId)),
    snapshot =>
      onData(
        snapshot.docs
          .map(toProfile)
          .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR')),
      ),
    onError,
  )

/**
 * Cria um login novo na unidade.
 * Usa um segundo app do Firebase só para criar a conta, assim o administrativo
 * não é deslogado (o createUser normal logaria como o novo usuário).
 */
export const createUnitUser = async ({unitId, name, email, password, role}) => {
  const secondaryAuth = getSecondaryAuth()
  let created = null
  try {
    created = await createUserWithEmailAndPassword(secondaryAuth, email, password)
    await setDoc(userDoc(created.user.uid), {
      name,
      email,
      role,
      unitId,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    // Se o perfil não foi salvo, não deixa uma conta "órfã" no Authentication.
    if (created) {
      await deleteUser(created.user).catch(() => {})
    }
    throw error
  } finally {
    await signOut(secondaryAuth).catch(() => {})
  }
}

/** Altera cargo, nome ou ativo/desativado de um login da unidade. */
export const updateUnitUser = (uid, fields) =>
  updateDoc(userDoc(uid), {...fields, updatedAt: serverTimestamp()})

/** Envia por e-mail o link para a pessoa criar uma senha nova. */
export const sendResetEmail = email => sendPasswordResetEmail(auth, email)