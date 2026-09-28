const SESSION_KEY = 'geoai-auth-session'
const USERS_STORAGE_KEY = 'geoai-registered-users'

async function hashPassword(password) {
  const salt = 'geocadastra-salt'
  if (typeof crypto !== 'undefined' && crypto?.subtle) {
    const msgUint8 = new TextEncoder().encode(salt + password)
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  let hash = 0x811c9dc5
  const combined = salt + password
  for (let i = 0; i < combined.length; i++) {
    hash ^= combined.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

function getLocalUsers() {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export const mockAuth = {
  async signIn({ email, password, remember }) {
    const cleanEmail = (email || '').trim().toLowerCase()
    if (!cleanEmail || !password) throw new Error('Email and password are required.')
    const users = getLocalUsers()
    const user = users.find((u) => u.email.toLowerCase() === cleanEmail)
    if (!user) throw new Error('Invalid email or password.')
    const hash = await hashPassword(password)
    if (hash !== user.passwordHash) throw new Error('Invalid email or password.')
    const session = {
      user: { id: user.id, email: user.email, full_name: user.full_name, organization: user.organization, role: user.role },
      token: 'geoai-token-' + Date.now()
    }
    if (remember) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    return session
  },
  getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },
  signOut() {
    sessionStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(SESSION_KEY)
  },
}
