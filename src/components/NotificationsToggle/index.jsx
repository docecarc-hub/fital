import {useEffect, useRef, useState} from 'react'

import {
  disablePush,
  enablePush,
  getPushSupport,
  isPushEnabled,
  listenForeground,
} from '../../services/notifications'

const SUPPORT_MESSAGES = {
  'not-configured':
    'Os avisos ainda não foram configurados (falta a chave VITE_FIREBASE_VAPID_KEY).',
  'ios-install':
    'No iPhone, abra o app pelo ícone da Tela de Início (Compartilhar > Adicionar à Tela de Início) para ativar os avisos.',
  unsupported:
    'Este navegador ou endereço não permite avisos. Use o site publicado (https) em um navegador atualizado.',
}

const NotificationsToggle = ({uid, unitId, onMessage}) => {
  const [support, setSupport] = useState('checking')
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)

  // Sempre chama a versão mais recente da função, sem reinscrever o listener.
  const onMessageRef = useRef(onMessage)
  useEffect(() => {
    onMessageRef.current = onMessage
  })

  // Ao abrir o app: se os avisos já estavam ligados, renova o registro do aparelho.
  useEffect(() => {
    let cancelled = false

    getPushSupport().then(async state => {
      if (cancelled) return
      setSupport(state)
      if (state !== 'ok' || !isPushEnabled()) return

      try {
        await enablePush({uid, unitId})
        if (!cancelled) setEnabled(true)
      } catch (error) {
        console.error(error)
      }
    })

    return () => {
      cancelled = true
    }
  }, [uid, unitId])

  // Com o app aberto na tela, mostra o aviso como mensagem dentro do próprio app.
  useEffect(() => {
    if (!enabled) return undefined
    return listenForeground(data => {
      if (data.body) onMessageRef.current(data.body)
    })
  }, [enabled])

  const onClick = async () => {
    if (busy || support === 'checking') return
    if (support !== 'ok') {
      window.alert(SUPPORT_MESSAGES[support] || SUPPORT_MESSAGES.unsupported)
      return
    }

    setBusy(true)
    try {
      if (enabled) {
        await disablePush()
        setEnabled(false)
      } else {
        const result = await enablePush({uid, unitId})
        if (result === 'granted') {
          setEnabled(true)
        } else {
          window.alert(
            'As notificações estão bloqueadas neste aparelho. Libere nas configurações do navegador para receber os avisos.',
          )
        }
      }
    } catch (error) {
      console.error(error)
      window.alert('Não foi possível alterar os avisos agora. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className="btn btn-outline"
      onClick={onClick}
      disabled={busy}
      aria-pressed={enabled}
      title={
        enabled
          ? 'Avisos de novos agendamentos ligados. Toque para desligar.'
          : 'Ligar avisos de novos agendamentos neste aparelho.'
      }
    >
      {enabled ? '🔔 Avisos' : '🔕 Avisos'}
    </button>
  )
}

export default NotificationsToggle
