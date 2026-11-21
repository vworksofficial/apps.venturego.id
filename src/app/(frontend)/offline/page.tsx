'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(false)

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const handleOnline = () => {
      setIsOnline(true)
      window.location.reload()
    }
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[var(--canvas)] p-5">
      <section className="mx-auto flex w-full max-w-[430px] flex-col items-center rounded-3xl bg-white p-8 text-center shadow-[0_12px_36px_rgba(15,23,42,0.08)] ring-1 ring-slate-100">
        <div className="grid size-20 place-items-center rounded-3xl bg-blue-50 text-[var(--primary)] ring-8 ring-blue-50/50">
          <Image
            alt="VentureGo"
            className="size-11 opacity-90"
            height={44}
            src="/venturego-mark.svg"
            width={44}
          />
        </div>

        <span className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200/60">
          <span className="size-2 animate-pulse rounded-full bg-amber-500" />
          Koneksi Terputus
        </span>

        <h1 className="mt-3 text-xl font-extrabold tracking-tight text-slate-900">
          Tidak Ada Jaringan
        </h1>

        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          Perangkat Anda sedang tidak terhubung ke internet. Pastikan koneksi Wi-Fi atau data
          seluler aktif.
        </p>

        <div className="mt-6 w-full space-y-3">
          <button
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-5 py-3.5 text-xs font-bold text-white shadow-sm transition hover:opacity-95 active:scale-[0.99]"
            onClick={() => window.location.reload()}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
            <span>Coba Muat Ulang</span>
          </button>

          {isOnline && (
            <p className="text-[11px] font-semibold text-emerald-600 animate-fade-in">
              Koneksi terdeteksi kembali. Memuat ulang…
            </p>
          )}
        </div>
      </section>
    </main>
  )
}
