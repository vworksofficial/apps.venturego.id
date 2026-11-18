'use client'

import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { getFirebaseClientAuth } from '@/lib/firebase-client'
import { getStudentNumber, getUserActivityFeed, type UserApplicationDetail } from '../../actions'
import { DashboardCard, DashboardScaffold, SkeletonBlock } from '../../_components/dashboard-ui'

export default function StudentCardPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [studentNumber, setStudentNumber] = useState('')
  const [studentNumberError, setStudentNumberError] = useState('')
  const [applications, setApplications] = useState<UserApplicationDetail[]>([])

  const application = applications[0] ?? null

  useEffect(() => {
    let active = true
    const unsubscribe = onAuthStateChanged(getFirebaseClientAuth(), async (user) => {
      if (!user || !active) {
        if (active) setLoading(false)
        return
      }
      try {
        const token = await user.getIdToken()
        if (!active) return
        const [feed, studentProfile] = await Promise.all([
          getUserActivityFeed(token),
          getStudentNumber(token),
        ])
        if (!active) return
        if (feed.ok) {
          setApplications(feed.applications)
          setError('')
        } else {
          setError(feed.message)
        }
        if (studentProfile.ok) {
          setStudentNumber(studentProfile.studentNumber)
          setStudentNumberError('')
        } else {
          setStudentNumberError(studentProfile.message)
        }
      } catch {
        if (active) setError('Kartu belum dapat dimuat. Silakan coba lagi.')
      } finally {
        if (active) setLoading(false)
      }
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const displayName = application?.applicantName || '—'
  const programLabel = application
    ? `${application.product === 'FULL_COVER' ? 'Full Cover' : 'Dana Keberangkatan'} · ${
        application.destination === 'TURKEY' ? 'Turki' : 'Jepang'
      }`
    : '—'

  return (
    <DashboardScaffold
      active="profil"
      backHref="/dashboard/profil"
      subtitle="Kartu ringkas NIS VSV"
      title="Kartu Identitas Siswa"
    >
      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <DashboardCard className="p-5">
          <div aria-label="Memuat kartu" className="space-y-3" role="status">
            <span className="sr-only">Memuat kartu…</span>
            <SkeletonBlock className="h-3 w-1/2" />
            <SkeletonBlock className="h-7 w-40" />
            <SkeletonBlock className="h-4 w-2/3" />
            <SkeletonBlock className="h-4 w-1/2" />
          </div>
        </DashboardCard>
      ) : (
        <div
          className="relative isolate flex aspect-[1.586/1] w-full flex-col justify-between overflow-hidden rounded-[24px] bg-gradient-to-br from-[#2878ed] via-[#0b57d0] to-[#073c91] p-4 text-white shadow-[0_18px_40px_rgba(11,87,208,0.24)] print:aspect-auto print:h-[54mm] print:w-[85.6mm] print:rounded-none print:p-[4mm] print:shadow-none"
          id="student-card"
        >
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 size-full"
            fill="none"
            preserveAspectRatio="none"
            viewBox="0 0 400 252"
          >
            <ellipse
              cx="200"
              cy="126"
              rx="238"
              ry="110"
              stroke="white"
              strokeOpacity="0.24"
              strokeWidth="1"
              transform="rotate(-17 200 126)"
            />
            <ellipse
              cx="200"
              cy="126"
              rx="198"
              ry="82"
              stroke="white"
              strokeOpacity="0.16"
              strokeWidth="1"
              transform="rotate(-17 200 126)"
            />
            <ellipse
              cx="200"
              cy="126"
              rx="154"
              ry="55"
              stroke="white"
              strokeOpacity="0.1"
              strokeWidth="1"
              transform="rotate(-17 200 126)"
            />
            <circle cx="48" cy="58" r="4" fill="#71e3b1" fillOpacity="0.9" />
            <circle cx="335" cy="47" r="3.5" fill="#ff9a91" fillOpacity="0.9" />
            <circle cx="354" cy="185" r="4" fill="#ffd65a" fillOpacity="0.9" />
            <circle cx="103" cy="218" r="2.5" fill="#a9ceff" fillOpacity="0.9" />
          </svg>
          <div className="relative z-10 flex items-center justify-between gap-3 border-b border-white/15 pb-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20">
                <img alt="" className="size-5" height={20} src="/venturego-mark.svg" width={20} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-extrabold tracking-wide">
                  Vworks Student Venture
                </p>
                <p className="text-[9px] text-blue-100">Kartu identitas siswa</p>
              </div>
            </div>
            <span className="shrink-0 text-[9px] font-semibold tracking-wide text-blue-100">
              venturego.id
            </span>
          </div>

          <div className="relative z-10 grid min-h-0 flex-1 grid-cols-[1fr_0.9fr] items-center gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-blue-100">
                Nama siswa
              </p>
              <p className="mt-1 line-clamp-2 text-[15px] font-bold leading-[1.15] tracking-tight">
                {displayName}
              </p>
              <div className="mt-2.5 min-w-0">
                <p className="text-[8px] font-semibold uppercase tracking-wider text-blue-200">
                  LPK
                </p>
                <p className="mt-0.5 truncate text-[10px] font-semibold text-white">
                  {application?.lpkName || '—'}
                </p>
              </div>
              <div className="mt-1.5 min-w-0">
                <p className="text-[8px] font-semibold uppercase tracking-wider text-blue-200">
                  Program & tujuan
                </p>
                <p className="mt-0.5 truncate text-[10px] font-semibold text-white">
                  {programLabel}
                </p>
              </div>
            </div>
            <div className="min-w-0 rounded-2xl border border-white/15 bg-white/10 px-3 py-3">
              <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-blue-100">
                Nomor Induk Siswa
              </p>
              <p className="mt-1.5 break-words text-[15px] font-extrabold leading-tight tracking-[0.06em]">
                {studentNumber || 'Belum tersedia'}
              </p>
              {!studentNumber && !studentNumberError && (
                <p className="mt-1.5 text-[8px] leading-[14px] text-blue-100">
                  Terbit setelah dokumen akad diterbitkan.
                </p>
              )}
              {studentNumberError && (
                <p className="mt-1.5 text-[8px] leading-[14px] text-amber-100">
                  Nomor belum dapat dimuat.
                </p>
              )}
            </div>
          </div>

          <div className="relative z-10 flex items-center justify-between border-t border-white/15 pt-2 text-[8px] text-blue-100">
            <span>Identitas peserta VSV</span>
            <span className="font-semibold tracking-wide">venturego.id</span>
          </div>
        </div>
      )}

      <p className="text-[11px] leading-5 text-slate-500">
        Tunjukkan kartu ini kepada LPK atau tim VSV sebagai bukti keterdaftarannya. Gunakan tombol
        di bawah untuk mencetak salinan fisik.
      </p>

      <button
        className="w-full rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
        disabled={loading}
        onClick={() => window.print()}
        type="button"
      >
        Cetak kartu
      </button>
    </DashboardScaffold>
  )
}
