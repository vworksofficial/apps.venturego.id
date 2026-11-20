'use client'

import { useEffect, useState } from 'react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type InstallableNavigator = Navigator & {
  install?: () => Promise<void>
  standalone?: boolean
}

let pendingInstallPrompt: InstallPromptEvent | null = null

export function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [installAvailable, setInstallAvailable] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState('')

  useEffect(() => {
    const appNavigator = window.navigator as InstallableNavigator
    const supportsWebInstall = typeof appNavigator.install === 'function'
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches || appNavigator.standalone === true

    setInstalled(isStandalone)
    setInstallPrompt(pendingInstallPrompt)
    setInstallAvailable(supportsWebInstall)
    if (pendingInstallPrompt) setInstallAvailable(true)

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      pendingInstallPrompt = event as InstallPromptEvent
      setInstallPrompt(pendingInstallPrompt)
      setInstallAvailable(true)
    }
    const onAppInstalled = () => {
      setInstalled(true)
      pendingInstallPrompt = null
      setInstallPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  const handleInstall = async () => {
    const appNavigator = window.navigator as InstallableNavigator
    const install = appNavigator.install
    const prompt = installPrompt ?? pendingInstallPrompt
    if (!install && !prompt) return

    setInstalling(true)
    setInstallError('')
    try {
      if (install) {
        // Call synchronously from this tap so the browser retains user activation.
        await install.call(appNavigator)
        setInstalled(true)
      } else if (prompt) {
        pendingInstallPrompt = null
        setInstallPrompt(null)
        await prompt.prompt()
        const { outcome } = await prompt.userChoice
        if (outcome === 'accepted') setInstalled(true)
        else setInstallAvailable(false)
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setInstallError('Prompt pemasangan tidak dapat dibuka. Coba lagi melalui browser Chrome.')
      }
    } finally {
      setInstalling(false)
    }
  }

  if (!installed && !installAvailable) return null

  return (
    <>
      <button
        aria-live="polite"
        className="welcome-secondary inline-flex min-h-[58px] w-full items-center justify-center gap-2 rounded-full border border-blue-200 bg-white px-4 text-sm font-bold text-[#0b57d0] transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b57d0] disabled:cursor-default disabled:opacity-70"
        disabled={installed || installing}
        onClick={handleInstall}
        type="button"
      >
        {installed ? (
          <svg aria-hidden="true" className="size-[18px]" fill="none" viewBox="0 0 24 24">
            <path
              d="m5 12 4 4L19 6"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        ) : (
          <svg aria-hidden="true" className="size-[18px]" fill="none" viewBox="0 0 24 24">
            <path
              d="M12 3v11m0 0 4-4m-4 4-4-4M5 16v4h14v-4"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        )}
        <span>
          {installed
            ? 'Aplikasi sudah terpasang'
            : installing
              ? 'Membuka pemasangan…'
              : 'Pasang aplikasi'}
        </span>
      </button>
      {installError && (
        <p className="-mt-1 text-center text-xs text-rose-600" role="status">
          {installError}
        </p>
      )}
    </>
  )
}
