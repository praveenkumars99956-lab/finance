/**
 * Register the app-shell service worker. Only production builds register it so
 * Vite HMR is never shadowed by a stale cache during development.
 */
export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null)
  }

  if (!import.meta.env.PROD) {
    return Promise.resolve(null)
  }

  return navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((registration) => registration)
    .catch((error) => {
      console.warn('[offline] service worker registration failed', error)
      return null
    })
}

export async function requestBackgroundSync() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false
  }

  try {
    const registration = await navigator.serviceWorker.ready
    if (!registration.sync) return false
    await registration.sync.register('finance-outbox')
    return true
  } catch {
    return false
  }
}
