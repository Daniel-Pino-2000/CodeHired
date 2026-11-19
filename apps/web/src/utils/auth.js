// Where to go after signing in. Only paths on this site are followed, so a link such as
// `/login?next=https://evil.example` (or `//evil.example`) can't send people elsewhere.
export function safeNext (next) {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return '/'
  }
  // Coming back to the login or register page would only redirect again
  if (/^\/(login|register)(?:[/?#]|$)/.test(next)) return '/'
  return next
}

// `/login?next=/account`, keeping the page's query string
export function loginPath ({ pathname, search = '' }, page = '/login') {
  return `${page}?${new URLSearchParams({ next: `${pathname}${search}` })}`
}

// The same limits as the API's schemas (apps/api/src/schemas/auth.ts), so most mistakes are
// caught before a request
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128
export const NAME_MAX = 100

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateLogin ({ email, password }) {
  const errors = {}
  if (!email.trim()) errors.email = 'Enter your email'
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address'
  if (!password) errors.password = 'Enter your password'
  return errors
}

export function validateRegister ({ name, email, password }) {
  const errors = validateLogin({ email, password })
  if (!name.trim()) errors.name = 'Enter your name'
  else if (name.trim().length > NAME_MAX) errors.name = `Use at most ${NAME_MAX} characters`
  if (password && password.length < PASSWORD_MIN) errors.password = `Use at least ${PASSWORD_MIN} characters`
  else if (password.length > PASSWORD_MAX) errors.password = `Use at most ${PASSWORD_MAX} characters`
  return errors
}

// Field errors from the API's 400 answer (`{ email: ['Invalid email address'] }`), first message each
export function apiFieldErrors (error) {
  return Object.fromEntries(
    Object.entries(error?.details ?? {})
      .filter(([, messages]) => messages?.length)
      .map(([field, messages]) => [field, messages[0]])
  )
}
