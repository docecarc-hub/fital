/* Recebe as notificações quando o app está fechado ou em segundo plano. */
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js')

// A configuração chega pela URL de registro (veja services/notifications.js),
// porque o service worker não enxerga as variáveis do .env.
const params = new URL(self.location.href).searchParams

firebase.initializeApp({
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage(payload => {
  const data = payload.data || {}
  return self.registration.showNotification(data.title || 'Novo agendamento', {
    body: data.body || '',
    icon: '/img/logo192.png',
    badge: '/img/logo192.png',
    tag: data.appointmentId || 'agendamento',
    data: {url: data.url || '/'},
  })
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
      for (const client of list) {
        if ('focus' in client) return client.focus()
      }
      return clients.openWindow(url)
    }),
  )
})
