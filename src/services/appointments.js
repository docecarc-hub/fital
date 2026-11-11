import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore'
import { db } from '../firebase'

const COLLECTION_NAME = 'appointments'

/**
 * Escuta em tempo real os agendamentos filtrados estritamente pela unidade atual.
 */
export function subscribeAppointments(unitId, callback, onError) {
  if (!unitId) {
    callback([])
    return () => {}
  }

  const q = query(
    collection(db, COLLECTION_NAME),
    where('unitId', '==', unitId)
  )

  return onSnapshot(
    q, 
    (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      // Ordena por data localmente para garantir consistência visual
      list.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      callback(list)
    }, 
    onError
  )
}

/**
 * Adiciona um novo agendamento atrelando-o à unidade (unitId) do utilizador logado.
 */
export async function addAppointment(unitId, data) {
  if (!unitId) {
    throw new Error('A unidade (unitId) não foi informada para salvar o agendamento.')
  }

  const docRef = await addDoc(collection(db, COLLECTION_NAME), {
    ...data,
    unitId,
    createdAt: serverTimestamp()
  })
  return docRef.id
}

/**
 * Atualiza campos específicos de um agendamento existente.
 */
export async function updateAppointment(unitId, id, data) {
  if (!id) return
  const docRef = doc(db, COLLECTION_NAME, id)
  await updateDoc(docRef, data)
}

/**
 * Altera o status de concluído/realizado do agendamento.
 */
export async function setAppointmentCompleted(unitId, id, isCompleted) {
  if (!id) return
  const docRef = doc(db, COLLECTION_NAME, id)
  await updateDoc(docRef, { isCompleted })
}

/**
 * Remove um agendamento do Firestore.
 */
export async function deleteAppointment(unitId, id) {
  if (!id) return
  const docRef = doc(db, COLLECTION_NAME, id)
  await deleteDoc(docRef)
}

// Alias para garantir compatibilidade com componentes que importam 'removeAppointment'
export const removeAppointment = deleteAppointment