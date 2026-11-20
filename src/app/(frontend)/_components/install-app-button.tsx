'use client'

import { useEffect, useState } from 'react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type InstallPlatform = 'android' | 'ios' | 'other'

export function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [platform, setPlatform] = useState<InstallPlatform>('other')
  const [installed, setInstalled] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)

  useEffect(() => {
    const userAgent = window.navigator.userAgent
    const isIOS =
      /iPad|iPhone|iPod/.test(userAgent) ||
      (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
    const isAndroid = /Android/i.test(userAgent)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true

    setPlatform(isIOS ? 'ios' : isAndroid ? 'android' : 'other')
    setInstalled(isStandalone)

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    const onAppInstalled = () => {
      setInstalled(true)
      setInstallPrompt(null)
      setShowInstructions(false)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  useEffect(() => {
    if (!showInstructions) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowInstructions(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showInstructions])

  const handleInstall = async () => {
    if (!installPrompt) {
      setShowInstructions(true)
      return
    }

    const prompt = installPrompt
    setInstallPrompt(null)
    try {
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      if (outcome === 'accepted') setInstalled(true)
    } catch {
      setShowInstructions(true)
    }
  }

  return (
    <>
      <button
        aria-haspopup="dialog"
        className="welcome-secondary inline-flex items-center justify-center gap-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b57d0]"
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
        <span>{installed ? 'Aplikasi sudah terpasang' : 'Pasang aplikasi'}</span>
      </button>

      {showInstructions && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-5 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowInstructions(false)
          }}
        >
          <section
            aria-labelledby="install-app-title"
            aria-modal="true"
            className="relative w-full max-w-sm rounded-3xl bg-white p-6 text-left shadow-2xl"
            role="dialog"
          >
            <button
              aria-label="Tutup petunjuk pemasangan"
              className="absolute top-4 right-4 grid size-9 place-items-center rounded-full bg-slate-100 text-xl text-slate-500 hover:bg-slate-200"
              onClick={() => setShowInstructions(false)}
              type="button"
            >
              ×
            </button>
            <div className="mb-4 grid size-11 place-items-center rounded-2xl bg-blue-50 text-[#0b57d0]">
              <svg aria-hidden="true" className="size-6" fill="none" viewBox="0 0 24 24">
                <path
                  d="M12 3v11m0 0 4-4m-4 4-4-4M5 16v4h14v-4"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
              </svg>
            </div>
            <h2 className="pr-8 text-lg font-bold text-slate-900" id="install-app-title">
              Pasang VentureGo di HP
            </h2>
            {platform === 'ios' ? (
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
                <li>Buka halaman ini menggunakan Safari.</li>
                <li>Ketuk tombol Bagikan, lalu pilih Tambahkan ke Layar Utama.</li>
                <li>Ketuk Tambah untuk menyelesaikan pemasangan.</li>
              </ol>
            ) : platform === 'android' ? (
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
                <li>Buka halaman ini di Chrome Android.</li>
                <li>Ketuk menu ⋮, lalu pilih Pasang aplikasi atau Install app.</li>
                <li>
                  Konfirmasi pemasangan. VentureGo akan muncul sebagai aplikasi di launcher HP.
                </li>
              </ol>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Buka menu browser dan pilih <strong>Pasang aplikasi</strong> atau{' '}
                <strong>Install app</strong>. Pada HP, gunakan Chrome Android atau Safari di iPhone.
              </p>
            )}
            <button
              className="mt-6 min-h-11 w-full rounded-full bg-[#0b57d0] px-5 text-sm font-semibold text-white transition hover:bg-blue-800"
              onClick={() => setShowInstructions(false)}
              type="button"
            >
              Mengerti
            </button>
          </section>
        </div>
      )}
    </>
  )
}
