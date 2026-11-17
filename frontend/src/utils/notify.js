const listeners = new Set()

export function notify(message, type = 'info', duration = 4000) {
  const text = message instanceof Error ? message.message : String(message ?? '')

  if (listeners.size === 0) {
    if (typeof console !== 'undefined') {
      console.warn(`[notify:${type}] ${text}`)
    }
    return
  }

  listeners.forEach((listener) => {
    listener({ message: text, type, duration })
  })
}

export function subscribeNotify(listener) {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}
