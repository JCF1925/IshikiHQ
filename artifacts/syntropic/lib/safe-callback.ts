const CALLBACK_BASE = 'https://syntropic.invalid'

export function safeRelativeCallback(value: string | null | undefined) {
  if (
    !value
    || !value.startsWith('/')
    || value.startsWith('//')
    || value.includes('\\')
    || /%5c/i.test(value)
    || /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return '/'
  }

  try {
    const parsed = new URL(value, CALLBACK_BASE)
    if (parsed.origin !== CALLBACK_BASE) return '/'
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return '/'
  }
}