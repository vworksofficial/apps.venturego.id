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

export function InstallAppButton({
  className,
  compact = false,
  hideWhenInstalled = false,
}: {
  className?: string
  compact?: boolean
  hideWhenInstalled?: boolean
}) {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [installAvailable, setInstallAvailable] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState('')
  const [isIos, setIsIos] = useState(false)
  const [showIosGuide, setShowIosGuide] = useState(false)

  useEffect(() => {
    const appNavigator = window.navigator as InstallableNavigator
    const supportsWebInstall = typeof appNavigator.install === 'function'
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches || appNavigator.standalone === true

    const iosDevice =
      /iphone|ipad|ipod/i.test(window.navigator.userAgent) &&
      !(window as unknown as { MSStream?: boolean }).MSStream

    setIsIos(iosDevice)
    setInstalled(isStandalone)
    setInstallPrompt(pendingInstallPrompt)

    if (isStandalone) {
      setInstallAvailable(false)
    } else if (iosDevice) {
      // iOS Safari uses manual "Add to Home Screen"
      setInstallAvailable(true)
    } else {
      setInstallAvailable(supportsWebInstall || Boolean(pendingInstallPrompt))
    }

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
      setInstallAvailable(false)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  const handleInstall = async () => {
    if (installed) return

    // iOS Safari: open instructional guide
    if (isIos) {
      setShowIosGuide(true)
      return
    }

    const appNavigator = window.navigator as InstallableNavigator
    const install = appNavigator.install
    const prompt = installPrompt ?? pendingInstallPrompt
    if (!install && !prompt) return

    setInstalling(true)
    setInstallError('')
    try {
      if (install) {
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

  if ((!installed && !installAvailable) || (installed && hideWhenInstalled)) return null

  const defaultClasses = compact
    ? 'inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-[#0b57d0] shadow-sm transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b57d0] disabled:cursor-default disabled:opacity-70'
    : 'welcome-secondary inline-flex min-h-[58px] w-full items-center justify-center gap-2 rounded-full border border-blue-200 bg-white px-4 text-sm font-bold text-[#0b57d0] transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b57d0] disabled:cursor-default disabled:opacity-70'

  return (
    <>
      <button
        aria-live="polite"
        className={className || defaultClasses}
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

      {/* Modal panduan instalasi iOS Safari */}
      {showIosGuide && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowIosGuide(false)
          }}
        >
          <div
            aria-labelledby="ios-install-title"
            aria-modal="true"
            className="w-full max-w-sm rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-xl bg-blue-50 text-[var(--primary)]">
                  <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      d="M12 3v11m0 0 4-4m-4 4-4-4M5 16v4h14v-4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                </span>
                <h3 className="text-base font-bold text-slate-900" id="ios-install-title">
                  Pasang di iPhone / iPad
                </h3>
              </div>
              <button
                aria-label="Tutup panduan pemasangan"
                className="grid size-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                onClick={() => setShowIosGuide(false)}
                type="button"
              >
                ×
              </button>
            </div>

            <p className="mt-3 text-xs leading-5 text-slate-600">
              Pasang aplikasi VentureGo ke layar utama ponsel Anda untuk akses cepat dan layar
              penuh:
            </p>

            <ol className="mt-4 space-y-3 text-xs leading-5 text-slate-700">
              <li className="flex items-start gap-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-blue-100 text-[10px] font-bold text-[var(--primary)]">
                  1
                </span>
                <span>
                  Ketuk tombol <strong>Bagikan</strong> (ikon kotak dengan panah ke atas) di bilah
                  bawah Safari.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-blue-100 text-[10px] font-bold text-[var(--primary)]">
                  2
                </span>
                <span>
                  Gulir ke bawah menu, lalu pilih <strong>Tambah ke Layar Utama</strong> (
                  <em>Add to Home Screen</em>).
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-blue-100 text-[10px] font-bold text-[var(--primary)]">
                  3
                </span>
                <span>
                  Ketuk <strong>Tambah</strong> di sudut kanan atas untuk menyelesaikan.
                </span>
              </li>
            </ol>

            <button
              className="mt-6 w-full rounded-2xl bg-[var(--primary)] py-3 text-xs font-bold text-white shadow-sm transition hover:opacity-95"
              onClick={() => setShowIosGuide(false)}
              type="button"
            >
              Saya Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  )
}
