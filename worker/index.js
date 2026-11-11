const GOOGLE_JWK_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
const SCOPES =
  'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging'

const MAX_AGE_MS = 5 * 60 * 1000
const encoder = new TextEncoder()

const b64urlToBytes = text => {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

const bytesToB64url = bytes => {
  let binary = ''
  new Uint8Array(bytes).forEach(byte => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const jsonPart = value => bytesToB64url(encoder.encode(JSON.stringify(value)))

const corsHeaders = (request) => {
  const origin = request.headers.get('Origin') || ''
  
  let allowOrigin = '*'
  if (origin.endsWith('.vercel.app') || origin.includes('localhost') || origin.includes('web.app') || origin.includes('firebaseapp.com')) {
    allowOrigin = origin
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

const reply = (request, status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json', ...corsHeaders(request)},
  })

let jwkCache = {keys: null, expires: 0}

const getGoogleKeys = async () => {
  if (jwkCache.keys && Date.now() < jwkCache.expires) return jwkCache.keys
  const response = await fetch(GOOGLE_JWK_URL)
  if (!response.ok) throw new Error('Não foi possível buscar as chaves do Google.')
  const {keys} = await response.json()
  jwkCache = {keys, expires: Date.now() + 60 * 60 * 1000}
  return keys
}

const verifyIdToken = async (token, projectId) => {
  const parts = String(token || '').split('.')
  if (parts.length !== 3) throw new Error('Token inválido.')

  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])))
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])))
  if (header.alg !== 'RS256') throw new Error('Algoritmo inválido.')

  const jwk = (await getGoogleKeys()).find(each => each.kid === header.kid)
  if (!jwk) throw new Error('Chave do token não encontrada.')

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'},
    false,
    ['verify'],
  )
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(parts[2]),
    encoder.encode(`${parts[0]}.${parts[1]}`),
  )
  if (!valid) throw new Error('Assinatura inválida.')

  const now = Math.floor(Date.now() / 1000)
  if (payload.aud !== projectId) throw new Error('Token de outro projeto.')
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('Emissor inválido.')
  if (!payload.sub) throw new Error('Token sem usuário.')
  if (payload.exp <= now) throw new Error('Token expirado.')
  if (payload.iat > now + 300) throw new Error('Token com data inválida.')

  return payload.sub
}

let tokenCache = {value: null, expires: 0}

const pemToBytes = pem =>
  b64urlToBytes(
    pem
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/\s+/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_'),
  )

const getAccessToken = async account => {
  if (tokenCache.value && Date.now() < tokenCache.expires) return tokenCache.value

  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${jsonPart({alg: 'RS256', typ: 'JWT'})}.${jsonPart({
    iss: account.client_email,
    scope: SCOPES,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBytes(account.private_key),
    {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'},
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned))

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${bytesToB64url(signature)}`,
    }),
  })
  if (!response.ok) throw new Error(`Falha ao autenticar a conta de serviço (${response.status}).`)

  const data = await response.json()
  tokenCache = {value: data.access_token, expires: Date.now() + (data.expires_in - 120) * 1000}
  return tokenCache.value
}

const readValue = field => {
  if (!field) return undefined
  if ('stringValue' in field) return field.stringValue
  if ('booleanValue' in field) return field.booleanValue
  if ('integerValue' in field) return Number(field.integerValue)
  if ('doubleValue' in field) return field.doubleValue
  if ('timestampValue' in field) return field.timestampValue
  return undefined
}

const readDoc = doc => ({
  id: doc.name.split('/').pop(),
  updateTime: doc.updateTime,
  data: Object.fromEntries(
    Object.entries(doc.fields || {}).map(([name, field]) => [name, readValue(field)]),
  ),
})

const firestore = (projectId, accessToken) => {
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`
  const headers = {Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json'}

  return {
    async get(path) {
      const response = await fetch(`${base}/${path}`, {headers})
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`Firestore get ${path}: ${response.status}`)
      return readDoc(await response.json())
    },

    async whereEquals(collection, field, value) {
      const response = await fetch(`${base}:runQuery`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          structuredQuery: {
            from: [{collectionId: collection}],
            where: {
              fieldFilter: {
                field: {fieldPath: field},
                op: 'EQUAL',
                value: {stringValue: value},
              },
            },
          },
        }),
      })
      if (!response.ok) throw new Error(`Firestore query ${collection}: ${response.status}`)
      const rows = await response.json()
      return rows.filter(row => row.document).map(row => readDoc(row.document))
    },

    async markNotified(id, updateTime) {
      const url =
        `${base}/appointments/${encodeURIComponent(id)}` +
        `?updateMask.fieldPaths=notifiedAt&currentDocument.updateTime=${encodeURIComponent(updateTime)}`
      const response = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          fields: {notifiedAt: {timestampValue: new Date().toISOString()}},
        }),
      })
      return response.ok
    },

    async remove(path) {
      await fetch(`${base}/${path}`, {method: 'DELETE', headers}).catch(() => {})
    },
  }
}

const formatDate = isoDate => {
  const [, month, day] = String(isoDate || '').split('-')
  return month && day ? `${day}/${month}` : ''
}

const buildMessage = (appointment, appointmentId) => {
  const who = appointment.createdByName || 'Alguém'
  const client = appointment.client || appointment.title || 'Cliente'
  const car = appointment.car || 'Não informado'
  const service = appointment.service || 'Não informado'
  const date = formatDate(appointment.date) || 'Não informada'
  const time = appointment.time || 'Não informado'

  return {
    title: '📌 LEMBRETE DE AGENDAMENTO',
    body: `👤 Cliente: ${client}\n🚗 Veículo: ${car}\n🔧 Serviço: ${service}\n📅 Data: ${date}\n⏰ Horário: ${time}\n\n(Registado por: ${who})`,
    url: '/',
    appointmentId,
  }
}

const sendToToken = async (projectId, accessToken, token, data) => {
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: {Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      message: {
        token,
        data,
        webpush: {headers: {Urgency: 'high', TTL: '86400'}},
      },
    }),
  })
  if (response.ok) return 'sent'

  const body = await response.json().catch(() => ({}))
  const codes = (body.error?.details || []).map(each => each.errorCode)
  if (response.status === 404 || codes.includes('UNREGISTERED')) return 'stale'
  return 'failed'
}

const notify = async (request, env) => {
  const projectId = env.FIREBASE_PROJECT_ID
  if (!projectId || !env.FIREBASE_SERVICE_ACCOUNT) {
    return {status: 500, body: {error: 'Worker sem configuração (projeto ou conta de serviço).'}}
  }

  const bearer = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  let callerUid
  try {
    callerUid = await verifyIdToken(bearer, projectId)
  } catch (error) {
    return {status: 401, body: {error: `Login inválido: ${error.message}`}}
  }

  const {appointmentId} = await request.json().catch(() => ({}))
  if (!appointmentId || typeof appointmentId !== 'string') {
    return {status: 400, body: {error: 'Falta o appointmentId.'}}
  }

  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)
  const accessToken = await getAccessToken(account)
  const db = firestore(projectId, accessToken)

  const appointment = await db.get(`appointments/${encodeURIComponent(appointmentId)}`)
  if (!appointment) return {status: 404, body: {error: 'Agendamento não encontrado.'}}

  const {unitId, createdBy, createdAt, notifiedAt} = appointment.data
  if (!unitId || createdBy !== callerUid) {
    return {status: 403, body: {error: 'Este agendamento não é seu.'}}
  }
  if (notifiedAt) return {status: 200, body: {sent: 0, skipped: 'já avisado'}}
  if (!createdAt || Date.now() - Date.parse(createdAt) > MAX_AGE_MS) {
    return {status: 200, body: {sent: 0, skipped: 'agendamento antigo'}}
  }

  const users = await db.whereEquals('users', 'unitId', unitId)
  const caller = users.find(each => each.id === callerUid)
  if (!caller || caller.data.active === false) {
    return {status: 403, body: {error: 'Login desativado ou sem acesso à unidade.'}}
  }
  const recipients = new Set(
    users.filter(each => each.data.active !== false && each.id !== callerUid).map(each => each.id),
  )
  if (recipients.size === 0) return {status: 200, body: {sent: 0, skipped: 'sem destinatários'}}

  const devices = await db.whereEquals('fcmTokens', 'unitId', unitId)
  const tokens = devices.filter(each => recipients.has(each.data.uid)).map(each => each.id)
  if (tokens.length === 0) return {status: 200, body: {sent: 0, skipped: 'nenhum aparelho com avisos ligados'}}

  const locked = await db.markNotified(appointment.id, appointment.updateTime)
  if (!locked) return {status: 200, body: {sent: 0, skipped: 'já avisado'}}

  const data = buildMessage(appointment.data, appointment.id)
  const results = await Promise.all(
    tokens.map(token => sendToToken(projectId, accessToken, token, data)),
  )

  await Promise.all(
    tokens
      .filter((_, index) => results[index] === 'stale')
      .map(token => db.remove(`fcmTokens/${encodeURIComponent(token)}`)),
  )

  const sent = results.filter(each => each === 'sent').length
  return {status: 200, body: {sent, failed: results.filter(each => each === 'failed').length}}
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {status: 204, headers: corsHeaders(request)})
    }
    if (request.method !== 'POST') {
      return reply(request, 200, {ok: true, service: 'sitecar-notificacoes'})
    }

    try {
      const {status, body} = await notify(request, env)
      return reply(request, status, body)
    } catch (error) {
      console.error(error)
      return reply(request, 500, {error: 'Erro ao enviar os avisos.'})
    }
  },
}