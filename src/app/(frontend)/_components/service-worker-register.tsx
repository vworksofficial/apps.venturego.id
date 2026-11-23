'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const registerServiceWorker = () => {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: unknown) => {
        console.warn('[PWA] Service worker registration failed.', error)
      })
    }

    // The component may mount after the window `load` event has already fired.
    // Register immediately in that case so the worker is not silently skipped.
    if (document.readyState === 'complete') {
      registerServiceWorker()
      return
    }

    window.addEventListener('load', registerServiceWorker, { once: true })
    return () => window.removeEventListener('load', registerServiceWorker)
  }, [])

  return null
}
