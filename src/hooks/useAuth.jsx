import { createContext, useContext, useMemo, useState } from 'react'

const AuthContext = createContext(null)
const SESSION_KEY = 'geoai-auth-session'
const USERS_STORAGE_KEY = 'geoai-registered-users'
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY)
    if (!raw) return { user: null, token: '' }
    const parsed = JSON.parse(raw)
    return {
      user: parsed?.user ?? null,
      token: parsed?.token ?? '',
    }
  } catch {
    return { user: null, token: '' }
  }
}

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

async function saveLocalUser({ id, full_name, email, organization, role = 'Analyst', password }) {
  try {
    const users = getLocalUsers()
    const cleanEmail = email.trim().toLowerCase()
    const passwordHash = await hashPassword(password)
    const existingIndex = users.findIndex((u) => u.email.toLowerCase() === cleanEmail)
    const userRecord = {
      id: id || `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      full_name: (full_name || cleanEmail.split('@')[0]).trim(),
      email: cleanEmail,
      organization: organization ? organization.trim() : '',
      role: role || 'Analyst',
      passwordHash,
      createdAt: new Date().toISOString()
    }
    if (existingIndex >= 0) {
      users[existingIndex] = userRecord
    } else {
      users.push(userRecord)
    }
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users))
    return userRecord
  } catch {
    return null
  }
}

async function registerLocalUser({ fullName, email, password, organization }) {
  const cleanEmail = (email || '').trim().toLowerCase()
  const cleanName = (fullName || '').trim()

  if (!cleanEmail || !EMAIL_REGEX.test(cleanEmail)) {
    return { ok: false, error: 'Please enter a valid work email address.' }
  }

  if (!password || password.length < 8) {
    return { ok: false, error: 'Password must contain at least 8 characters.' }
  }

  const users = getLocalUsers()
  const existing = users.find((u) => u.email.toLowerCase() === cleanEmail)
  if (existing) {
    return { ok: false, error: 'An institutional account with this email address already exists.' }
  }

  const userRecord = await saveLocalUser({
    full_name: cleanName,
    email: cleanEmail,
    password,
    organization,
    role: 'Analyst'
  })

  if (!userRecord) {
    return { ok: false, error: 'Unable to save user credentials.' }
  }

  const publicUser = {
    id: userRecord.id,
    email: userRecord.email,
    full_name: userRecord.full_name,
    organization: userRecord.organization,
    role: userRecord.role
  }

  return { ok: true, user: publicUser }
}

async function loginLocalUser({ email, password }) {
  const cleanEmail = (email || '').trim().toLowerCase()

  if (!cleanEmail || !password) {
    return { ok: false, error: 'Email and password are required.' }
  }

  const users = getLocalUsers()
  const user = users.find((u) => u.email.toLowerCase() === cleanEmail)

  if (!user) {
    return { ok: false, error: 'Invalid email or password credentials provided.' }
  }

  const hash = await hashPassword(password)
  if (hash !== user.passwordHash) {
    return { ok: false, error: 'Invalid email or password credentials provided.' }
  }

  const publicUser = {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    organization: user.organization,
    role: user.role
  }

  return { ok: true, user: publicUser }
}

function parseApiError(response, body, fallbackMessage) {
  if (body?.detail) {
    if (typeof body.detail === 'string') {
      return body.detail
    }
    if (Array.isArray(body.detail)) {
      const messages = body.detail.map((item) => {
        if (typeof item === 'string') return item
        const field = Array.isArray(item?.loc) ? item.loc.filter((part) => part !== 'body').join(' ') : ''
        const msg = item?.msg || item?.message || 'Invalid value'
        return field ? `${field}: ${msg}` : msg
      })
      if (messages.length > 0) {
        return messages.join(', ')
      }
    }
    if (typeof body.detail === 'object') {
      return JSON.stringify(body.detail)
    }
  }

  if (typeof body?.message === 'string' && body.message.trim()) {
    return body.message
  }

  if (typeof body?.error === 'string' && body.error.trim()) {
    return body.error
  }

  if (response?.status === 409) {
    return 'An institutional account with this email address already exists.'
  }
  if (response?.status === 422) {
    return 'The provided credentials or parameters failed validation requirements.'
  }
  if (response?.status === 401) {
    return 'Invalid email or password credentials provided.'
  }
  if (response?.status === 403) {
    return 'Access forbidden. Workspace credentials lack permission.'
  }
  if (response?.status >= 500) {
    return `Authentication service encountered an internal error (HTTP ${response.status}).`
  }

  return fallbackMessage
}

export function AuthProvider({ children }) {
  const initial = readSession()
  const [user, setUser] = useState(initial.user)
  const [token, setToken] = useState(initial.token)
  const [loading, setLoading] = useState(false)

  const persist = (nextUser, nextToken, remember = false) => {
    setUser(nextUser)
    setToken(nextToken)
    const payload = JSON.stringify({ user: nextUser, token: nextToken })
    if (remember) {
      localStorage.setItem(SESSION_KEY, payload)
      sessionStorage.removeItem(SESSION_KEY)
    } else {
      sessionStorage.setItem(SESSION_KEY, payload)
      localStorage.removeItem(SESSION_KEY)
    }
  }

  const login = async (email, password, remember = false) => {
    setLoading(true)

    const cleanEmail = (email || '').trim().toLowerCase()
    if (!cleanEmail || !password) {
      setLoading(false)
      return { ok: false, error: 'Email and password are required.' }
    }

    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
      const response = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password }),
      })

      const body = await response.json().catch(() => null)

      if (response.ok) {
        const nextUser = body?.user ?? {
          id: body?.id || `user_${cleanEmail}`,
          email: cleanEmail,
          full_name: body?.full_name || cleanEmail.split('@')[0] || 'Geospatial Operator',
          role: body?.role || 'Analyst'
        }
        await saveLocalUser({
          id: nextUser.id,
          full_name: nextUser.full_name,
          email: nextUser.email,
          organization: nextUser.organization,
          role: nextUser.role,
          password
        })
        persist(nextUser, body?.access_token || body?.token || 'geoai-token', remember)
        return { ok: true, user: nextUser }
      }

      // If backend responded with 401 Unauthorized or other error
      const errorMessage = parseApiError(response, body, 'Invalid email or password credentials provided.')
      return { ok: false, error: errorMessage }
    } catch {
      // Backend is offline / unreachable — verify against registered credentials in client store
      const result = await loginLocalUser({ email: cleanEmail, password })
      if (result.ok) {
        persist(result.user, 'geoai-session-token', remember)
      }
      return result
    } finally {
      setLoading(false)
    }
  }

  const register = async (fullName, email, password, organization = '') => {
    setLoading(true)

    const cleanEmail = (email || '').trim().toLowerCase()
    const cleanName = (fullName || '').trim()

    if (!cleanEmail || !EMAIL_REGEX.test(cleanEmail)) {
      setLoading(false)
      return { ok: false, error: 'Please enter a valid work email address.' }
    }

    if (!password || password.length < 8) {
      setLoading(false)
      return { ok: false, error: 'Password must contain at least 8 characters.' }
    }

    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
      const response = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: cleanName,
          email: cleanEmail,
          password,
          organization: organization ? organization.trim() : undefined
        }),
      })

      const body = await response.json().catch(() => null)

      if (response.ok) {
        const nextUser = body?.user ?? {
          id: body?.id || `user_${cleanEmail}`,
          email: cleanEmail,
          full_name: cleanName,
          organization: organization ? organization.trim() : '',
          role: 'Analyst'
        }
        await saveLocalUser({
          id: nextUser.id,
          full_name: cleanName,
          email: cleanEmail,
          organization: organization ? organization.trim() : '',
          role: 'Analyst',
          password
        })
        return { ok: true, user: nextUser }
      }

      const errorMessage = parseApiError(response, body, 'Registration failed.')
      return { ok: false, error: errorMessage }
    } catch {
      // Backend is offline / unreachable — register securely in local store with SHA-256 password hash
      const result = await registerLocalUser({ fullName: cleanName, email: cleanEmail, password, organization })
      return result
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    setUser(null)
    setToken('')
    sessionStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(SESSION_KEY)
  }

  const updateUser = (nextUser) => {
    const remember = localStorage.getItem(SESSION_KEY) !== null
    const payload = JSON.stringify({ user: nextUser, token })
    if (remember) {
      localStorage.setItem(SESSION_KEY, payload)
    } else {
      sessionStorage.setItem(SESSION_KEY, payload)
    }
    setUser(nextUser)
  }

  const value = useMemo(() => ({
    user,
    token,
    isAuthenticated: Boolean(token && user),
    loading,
    login,
    register,
    logout,
    updateUser,
  }), [user, token, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
