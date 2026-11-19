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
  const destinationLabel = application?.destination === 'TURKEY' ? 'Turki' : 'Jepang'

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
        <div className="flex flex-col gap-4 print:flex-row print:gap-[5mm]" id="student-card-print">
          <div
            className="relative isolate flex aspect-[1.586/1] w-full flex-col overflow-hidden rounded-[24px] bg-white p-4 text-slate-900 shadow-[0_18px_40px_rgba(11,87,208,0.16)] ring-1 ring-slate-200 print:aspect-auto print:h-[54mm] print:w-[85.6mm] print:rounded-none print:p-[4mm] print:shadow-none"
            id="student-card"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-3 -top-3 z-[1] whitespace-nowrap text-[68px] font-black leading-none tracking-[-0.075em] text-slate-200/80"
            >
              VentureGo
            </div>
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-0 size-full"
              fill="none"
              preserveAspectRatio="none"
              viewBox="0 0 400 252"
            >
              <g transform="rotate(34 228 125)">
                <ellipse
                  cx="228"
                  cy="125"
                  rx="235"
                  ry="94"
                  stroke="#f1f2f3"
                  strokeDasharray="8 5 2 10 4 7 1 6"
                  strokeOpacity=".8"
                  strokeWidth="1.5"
                />
                <ellipse cx="228" cy="125" rx="208" ry="77" stroke="#f1f2f3" strokeWidth="2" />
                <ellipse cx="228" cy="125" rx="174" ry="61" stroke="#f1f2f3" strokeWidth="2" />
                <ellipse cx="228" cy="125" rx="140" ry="46" stroke="#f1f2f3" strokeWidth="2" />
                <ellipse cx="228" cy="125" rx="104" ry="31" stroke="#f1f2f3" strokeWidth="2" />
                <ellipse cx="228" cy="125" rx="68" ry="17" stroke="#f1f2f3" strokeWidth="2" />
                <circle
                  cx="27"
                  cy="125"
                  r="6"
                  fill="var(--primary)"
                  stroke="white"
                  strokeWidth="2"
                />
                <circle
                  cx="402"
                  cy="125"
                  r="4"
                  fill="var(--dot-red)"
                  stroke="white"
                  strokeWidth="2"
                />
                <circle
                  cx="228"
                  cy="171"
                  r="5.5"
                  fill="var(--dot-yellow)"
                  stroke="white"
                  strokeWidth="2"
                />
                <circle
                  cx="313"
                  cy="142"
                  r="3.5"
                  fill="var(--primary)"
                  stroke="white"
                  strokeWidth="1.5"
                />
                <circle
                  cx="202"
                  cy="140"
                  r="4.5"
                  fill="var(--dot-red)"
                  stroke="white"
                  strokeWidth="1.5"
                />
                <circle
                  cx="228"
                  cy="142"
                  r="2.5"
                  fill="var(--primary)"
                  stroke="white"
                  strokeWidth="1"
                />
              </g>
            </svg>
            <div className="relative z-10 flex justify-end text-right">
              <div className="text-[12px] font-bold leading-[1.12] text-[var(--primary)]">
                Vworks
                <br />
                <span className="text-orange-600">Student Venture</span>
              </div>
            </div>

            <div className="relative z-10 mt-auto mb-2 flex flex-col gap-0.5 pl-1">
              <div className="grid grid-cols-[64px_1fr] items-center gap-1.5">
                <span className="text-[10px] leading-[1.25] text-slate-400">Nama</span>
                <span className="truncate text-[11px] font-medium leading-[1.25] text-slate-900">
                  {displayName}
                </span>
              </div>
              <div className="grid grid-cols-[64px_1fr] items-center gap-1.5">
                <span className="text-[10px] leading-[1.25] text-slate-400">NIS</span>
                <span className="truncate text-[11px] font-medium leading-[1.25] text-slate-900">
                  {studentNumber || 'Belum tersedia'}
                </span>
              </div>
              <div className="grid grid-cols-[64px_1fr] items-center gap-1.5">
                <span className="text-[10px] leading-[1.25] text-slate-400">LPK Asal</span>
                <span className="truncate text-[11px] font-medium leading-[1.25] text-slate-900">
                  {application?.lpkName || '—'}
                </span>
              </div>
              <div className="grid grid-cols-[64px_1fr] items-center gap-1.5">
                <span className="text-[10px] leading-[1.25] text-slate-400">Negara</span>
                <span className="truncate text-[11px] font-medium leading-[1.25] text-slate-900">
                  {application ? destinationLabel : '—'}
                </span>
              </div>
            </div>

            <div className="relative z-10 -mx-4 -mb-4 mt-0 flex min-h-7 items-center justify-between border-t-[3px] border-orange-600 bg-[var(--primary)] px-4 py-1.5 text-[8px] font-semibold text-white print:-mx-[4mm] print:-mb-[4mm] print:px-[4mm]">
              <span>Kartu Identitas Siswa</span>
              <span>Venturego.id</span>
            </div>
          </div>
          <div
            className="relative flex aspect-[1.586/1] w-full items-center justify-center overflow-hidden rounded-[24px] bg-slate-300 text-center shadow-[0_18px_40px_rgba(11,87,208,0.12)] ring-1 ring-slate-300 print:aspect-auto print:h-[54mm] print:w-[85.6mm] print:rounded-none print:shadow-none"
            id="student-card-back"
          >
            <div className="flex flex-col items-center">
              <img
                alt=""
                aria-hidden="true"
                className="mb-1 size-5"
                height={23}
                src="/venturego-mark.svg"
                width={24}
              />
              <span className="text-lg font-bold leading-none tracking-tight text-white">
                VentureGo
              </span>
              <span className="mt-0.5 text-[10px] font-medium leading-tight tracking-wide text-white">
                Your Partner to Leap Together
              </span>
            </div>
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
